import "jest-extended";

import Hapi from "@hapi/hapi";
import { Enums, Interfaces as TransactionInterfaces } from "@packages/crypto";

import { buildSenderWallet, initApp, ItemResponse, PaginatedResponse } from "../__support__";
import { LocksController } from "../../../../packages/core-api/src/controllers/locks";
import { CryptoSuite, Interfaces } from "../../../../packages/core-crypto";
import { Application, Contracts } from "../../../../packages/core-kernel";
import { Identifiers } from "../../../../packages/core-kernel/src/ioc";
import { Transactions as MagistrateTransactions } from "../../../../packages/core-magistrate-crypto";
import { Wallets } from "../../../../packages/core-state";
import { Mocks } from "../../../../packages/core-test-framework/src";
import passphrases from "../../../../packages/core-test-framework/src/internal/passphrases.json";
import { TransactionHandlerRegistry } from "../../../../packages/core-transactions/src/handlers/handler-registry";
import { htlcSecretHashHex } from "../../core-transactions/handlers/__fixtures__/htlc-secrets";

const crypto = new CryptoSuite.CryptoSuite(CryptoSuite.CryptoManager.findNetworkByName("devnet"));

let app: Application;
let controller: LocksController;
let walletRepository: Wallets.WalletRepository;

let mockLastBlockData: Partial<Interfaces.IBlockData>;
const { EpochTimestamp } = Enums.HtlcLockExpirationType;
let makeBlockHeightTimestamp;
let makeNotExpiredTimestamp;

const transactionHistoryService = {
    listByCriteria: jest.fn(),
};

beforeEach(() => {
    app = initApp(crypto);

    // Triggers registration of indexes
    app.get<TransactionHandlerRegistry>(Identifiers.TransactionHandlerRegistry);
    app.bind(Identifiers.TransactionHistoryService).toConstantValue(transactionHistoryService);

    controller = app.resolve<LocksController>(LocksController);
    walletRepository = app.get<Wallets.WalletRepository>(Identifiers.WalletRepository);

    mockLastBlockData = { timestamp: crypto.CryptoManager.LibraryManager.Crypto.Slots.getTime(), height: 4 };

    makeBlockHeightTimestamp = (heightRelativeToLastBlock = 2) => mockLastBlockData.height! + heightRelativeToLastBlock;
    makeNotExpiredTimestamp = (type) =>
        type === EpochTimestamp ? mockLastBlockData.timestamp! + 999 : makeBlockHeightTimestamp(9);

    Mocks.StateStore.setBlock({ data: mockLastBlockData } as Interfaces.IBlock);
    transactionHistoryService.listByCriteria.mockReset();
});

afterEach(() => {
    try {
        crypto.TransactionManager.TransactionTools.TransactionRegistry.deregisterTransactionType(
            MagistrateTransactions.BusinessRegistrationTransaction,
        );
        crypto.TransactionManager.TransactionTools.TransactionRegistry.deregisterTransactionType(
            MagistrateTransactions.BridgechainRegistrationTransaction,
        );
    } catch {}
});

describe("LocksController", () => {
    let lockWallet: Contracts.State.Wallet;
    let htlcLockTransaction: TransactionInterfaces.ITransaction;

    beforeEach(() => {
        lockWallet = buildSenderWallet(app, crypto);

        const expiration = {
            type: EpochTimestamp,
            value: makeNotExpiredTimestamp(EpochTimestamp),
        };

        htlcLockTransaction = crypto.TransactionManager.BuilderFactory.htlcLock()
            .htlcLockAsset({
                secretHash: htlcSecretHashHex,
                expiration: expiration,
            })
            .recipientId(crypto.CryptoManager.Identities.Address.fromPassphrase(passphrases[1]))
            .amount("1")
            .nonce("1")
            .sign(passphrases[0])
            .build();

        lockWallet.setAttribute(
            "htlc.lockedBalance",
            crypto.CryptoManager.LibraryManager.Libraries.BigNumber.make("1"),
        );

        lockWallet.setAttribute("htlc.locks", {
            [htlcLockTransaction.id!]: {
                amount: htlcLockTransaction.data.amount,
                recipientId: htlcLockTransaction.data.recipientId,
                timestamp: mockLastBlockData.timestamp,
                ...htlcLockTransaction.data.asset!.lock,
            },
        });

        walletRepository.index(lockWallet);
    });

    describe("index", () => {
        it("should return list of delegates", async () => {
            const request: Hapi.Request = {
                query: {
                    page: 1,
                    limit: 100,
                    transform: false,
                },
            };

            const response = (await controller.index(request, undefined)) as PaginatedResponse;

            expect(response.totalCount).toBeDefined();
            expect(response.meta).toBeDefined();
            expect(response.results).toBeDefined();
            expect(response.results[0]).toEqual(
                expect.objectContaining({
                    lockId: htlcLockTransaction.id,
                }),
            );
        });
    });

    describe("show", () => {
        it("should return lock", async () => {
            const request: Hapi.Request = {
                params: {
                    id: htlcLockTransaction.id,
                },
            };

            const response = (await controller.show(request, undefined)) as ItemResponse;

            expect(response.data).toEqual(
                expect.objectContaining({
                    lockId: htlcLockTransaction.id,
                }),
            );
        });

        it("should return error if lock does not exists", async () => {
            const request: Hapi.Request = {
                params: {
                    id: "non_existing_lock_id",
                },
            };

            await expect(controller.show(request, undefined)).resolves.toThrowError("Lock not found");
        });
    });

    describe("search", () => {
        it("should return list of locks", async () => {
            const request: Hapi.Request = {
                params: {
                    id: htlcLockTransaction.id,
                },
                query: {
                    page: 1,
                    limit: 100,
                    transform: false,
                },
            };

            const response = (await controller.search(request, undefined)) as PaginatedResponse;

            expect(response.totalCount).toBeDefined();
            expect(response.meta).toBeDefined();
            expect(response.results).toBeDefined();
            expect(response.results[0]).toEqual(
                expect.objectContaining({
                    lockId: htlcLockTransaction.id,
                }),
            );
        });
    });

    describe("unlocked", () => {
        it("should return list of locks", async () => {
            transactionHistoryService.listByCriteria.mockResolvedValueOnce({
                rows: [
                    Object.assign({}, htlcLockTransaction.data, {
                        nonce: crypto.CryptoManager.LibraryManager.Libraries.BigNumber.make("1"),
                    }),
                ],
                count: 1,
                countIsEstimate: false,
            });

            const request: Hapi.Request = {
                query: {},
                payload: {
                    ids: [htlcLockTransaction.id],
                },
            };

            const response = (await controller.unlocked(request, undefined)) as PaginatedResponse;

            expect(response.totalCount).toBeDefined();
            expect(response.meta).toBeDefined();
            expect(response.results).toBeDefined();
            expect(response.results[0]).toEqual(
                expect.objectContaining({
                    id: htlcLockTransaction.id,
                }),
            );
        });
    });
});
