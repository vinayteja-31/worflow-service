# deploy-workflow-service

Standalone **Node.js + Express** service that implements the deployment workflow (Docker build/push → IAM login → container update → rollout poll). Same HTTP contract as `support-service-api-mgmt` workflow routes so you can run **only** this app locally or in your cluster while keeping the Go gateway for pure routing/proxying.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health/live` | Liveness |
| POST | `/api/deployments/execute` | Start deploy (async) |
| GET | `/api/deployments/:deploymentId` | Status |

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `IAM_SERVICE_URL` | Yes* | IAM base URL (e.g. `http://localhost:3005`) |
| `SERVICE_CONTAINER_MGMT_URL` | Yes* | Container mgmt base URL |
| `PORT` | No | Default `3000` |
| `TOWER_REGISTRY_USERNAME` / `TOWER_REGISTRY_PASSWORD` | If using `build.enabled` | Tower registry push credentials |

\* Service starts without them but deploy will fail until set.

Copy `.env.example` to `.env` and adjust. Load with `export $(grep -v '^#' .env | xargs)` or a process manager.

## Run locally

```bash
cd workflow-service
npm install
export IAM_SERVICE_URL=http://localhost:3005
export SERVICE_CONTAINER_MGMT_URL=https://service-container-mgmt.dev.tower.cloud
npm start
```

## Docker

Requires Docker on the **host** only if you use `build.enabled: true` in the JSON (same as Go service).

```bash
docker build -t deploy-workflow-service:local .
docker run --rm -p 3000:3000 \
  -e IAM_SERVICE_URL=... \
  -e SERVICE_CONTAINER_MGMT_URL=... \
  deploy-workflow-service:local
```

## Relationship to support-service-api-mgmt

- **This service**: owns orchestration logic.
- **Go gateway**: can proxy `/api/deployments/*` here, or you point `DEPLOY_GATEWAY_URL` in CI to this service’s URL instead of the Go app.

Request/response JSON matches the existing workflow handler in the Go repo.
