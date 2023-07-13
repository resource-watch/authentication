import nock from "nock";
import { faker } from "@faker-js/faker";
import config from "config";

export const mockCreateAWSAPIGatewayAPIKey: (override?: Record<string, any>) => string = (override = {}) => {
    const apiKey: string = faker.datatype.uuid();
    const apiKeyId: string = faker.datatype.uuid();

    nock('https://apigateway.us-east-1.amazonaws.com')
        .post('/apikeys',
            {
                enabled: true,
                name: "my application",
                value: "",
                ...override
            }
        )
        .reply(201, {
            createdDate: 1669793297,
            enabled: true,
            id: apiKeyId,
            lastUpdatedDate: 1669793297,
            name: "my application",
            stageKeys: [],
            value: apiKey
        });

    nock('https://apigateway.us-east-1.amazonaws.com')
        .post(`/usageplans/${config.get('aws.apiKeyUsagePlanId')}/keys`,
            {
                keyId: apiKeyId,
                keyType: "API_KEY"
            }
        )
        .reply(201, {});

    return apiKey;
};
export const mockUpdateAWSAPIGatewayAPIKey: (apiKeyId: string, name: string) => string = (apiKeyId: string, name: string) => {
    const apiKey: string = faker.datatype.uuid();

    nock('https://apigateway.us-east-1.amazonaws.com')
        .patch(`/apikeys/${apiKeyId}`, {
            patchOperations: [{
                op: "replace",
                path: "/name",
                value: name
            }]
        })
        .reply(200, {
            createdDate: 1662470529,
            enabled: true,
            id: apiKeyId,
            lastUpdatedDate: 1669817287,
            name: name,
            stageKeys: [],
            tags: {}
        });

    return apiKey;
};
export const mockDeleteAWSAPIGatewayAPIKey: (apiKeyId: string) => string = (apiKeyId: string) => {
    const apiKey: string = faker.datatype.uuid();

    nock('https://apigateway.us-east-1.amazonaws.com')
        .delete(`/apikeys/${apiKeyId}`)
        .reply(202, '');

    return apiKey;
};
