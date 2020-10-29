# v2.4.2

## 27/10/2020

- Upgrade `sparkpost` NPM package to version 2.1.4.

# 2.4.1

## 13/07/2020

- Update version used of Facebook Graph API to 7.0 in Facebook OAuth. [GTC-654](https://gfw.atlassian.net/browse/GTC-654)
- Security updates for `handlebars` and `websocket-extensions` NPM packages.

# 2.4.0

## 25/06/2020

- Add GET `/user/me` endpoint as a convenient way to get the details of the current user.
- Prevent users from assigning roles to themselves on sign up.

## 27/04/2020

- Modify configuration to match AWS deployment. Deprecate deployment on GCP.

# 2.3.0

## 02/04/2020

- Add possibility of toggling a read-only mode that blocks all write endpoints.
- Fix error when trying to find users by ids providing invalid object ids.

# 2.2.0

## 14/02/2020

- Remove `toDelete` from microservice model.
- Add `createdAt` and `updatedAt` fields to the endpoint model.
- Add basic filters to get endpoints endpoint.

## 12/02/2020

- Fix issue where pending microservice cron would not trigger a version update on the endpoints table
- Add endpoint to get microservice details by id
- Add status and url filters to get microservices endpoint

## 11/02/2020

- Merge control tower cron deployment process

## 09/02/2020

- Modify microservice registration process so that it doesn't go to error by default.
- Refactor cron logic so that long-failing microservices get deleted.
- Save microservice name in endpoint redirect.
- Prevent duplicated tags when saving microservice data to the database.

## 05/02/2020

- Prevent statistics logging for `/healthcheck` endpoint.

## 27/01/2020

- Update `passport-facebook` NPM package version to its latest version.
- Fix grammar for `email exists` error when attempting to register and existing user. `email exist` -> `email exists`

# v2.1.0

## 27/01/2020

- Update `passport-facebook` NPM package version to its latest version.
- Add and use `fromEmail` field on oauth plugin configuration (inside each application) as the name of the sender for auth-related emails.
- Change callback URL logic so that priority is:
  - Query param
  - Session
  - Referrer
- Refactor tests to (even) better handle redirect cases
- Refactor tests to better handle redirect cases
- Add pagination to GET users
- Fix regression where 3rd party auth users without email address would not be able to authenticate
- Add healthcheck endpoint and readiness+liveliness checks to k8s config
- Serialize user on response to account confirmation.
