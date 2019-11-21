import Hapi from "@hapi/hapi";
import Joi from "@hapi/joi";

import { BusinessController } from "../controllers/businesses";

export const register = (server: Hapi.Server): void => {
    const controller = server.app.app.resolve(BusinessController);
    server.bind(controller);

    server.route({
        method: "GET",
        path: "/businesses",
        handler: controller.index,
        options: {
            validate: {
                query: {
                    ...server.app.schemas.pagination,
                    ...{
                        orderBy: Joi.string(),
                        businessId: Joi.number()
                            .integer()
                            .min(1),
                        name: Joi.string()
                            .regex(/^[a-zA-Z0-9_-]+$/)
                            .max(40),
                        website: Joi.string().max(50),
                        vat: Joi.string()
                            .alphanum()
                            .max(15),
                        repository: Joi.string().max(50),
                    },
                },
            },
        },
    });

    server.route({
        method: "GET",
        path: "/businesses/{id}",
        handler: controller.show,
        options: {
            validate: {
                params: {
                    id: Joi.number()
                        .integer()
                        .min(1),
                },
            },
        },
    });

    server.route({
        method: "GET",
        path: "/businesses/{id}/bridgechains",
        handler: controller.bridgechains,
        options: {
            validate: {
                params: {
                    id: Joi.number()
                        .integer()
                        .min(1),
                },
                query: {
                    ...server.app.schemas.pagination,
                    ...{
                        orderBy: Joi.string(),
                    },
                },
            },
        },
    });

    server.route({
        method: "POST",
        path: "/businesses/search",
        handler: controller.search,
        options: {
            validate: {
                query: {
                    ...server.app.schemas.pagination,
                    ...{
                        orderBy: Joi.string(),
                    },
                },
                payload: {
                    businessId: Joi.number()
                        .integer()
                        .min(1),
                },
            },
        },
    });
};
