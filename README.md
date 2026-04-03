# Tower Cloud Container Deploy Action

GitHub Action for deploying container images to [Tower Cloud](https://console.tower.cloud) Container Instances. Build, push, and update your container instance with a new image on every commit.

## Prerequisites

Before using this action, you need:

- A **Tower Cloud account** with an organization
- An existing **Container Instance** in Tower Cloud
- A **Tower Container Registry (TCR)** with a repository created
- The **API gateway URL** provided by your Tower Cloud administrator

> This action only **updates** existing container instances — it does not create new ones. Create your container instance first via the [Tower Cloud portal](https://console.tower.cloud).

## Arguments

### Required

| Argument | Description |
|----------|-------------|
| `tower-api-url` | Tower Cloud API gateway URL (e.g. `https://api.dev.tower.cloud`) |
| `tower-user` | Tower Cloud IAM username |
| `tower-password` | Tower Cloud IAM password |
| `organization-id` | Tower Cloud organization ID (UUID) |
| `container-name` | Name of the existing container instance to update |
| `image` | Full image URI to deploy (e.g. `test2.hyd.cr.tower.cloud/my-org/my-app:abc123`) |

### Optional

| Argument | Description |
|----------|-------------|
| `registry-username` | Registry username for Tower or private registries |
| `registry-password` | Registry password for Tower or private registries |

### Outputs

| Output | Description |
|--------|-------------|
| `status` | Deployment status (`accepted`) |
| `image` | The image URI that was deployed |
| `task-id` | Deployment task ID returned by Tower Cloud |

## Setting Up Secrets and Variables

In your GitHub repository, go to **Settings > Secrets and variables > Actions** and add:

**Secrets:**

| Secret Name | Description |
|-------------|-------------|
| `DEPLOY_IAM_USERNAME` | Tower Cloud IAM username |
| `DEPLOY_IAM_PASSWORD` | Tower Cloud IAM password |
| `DEPLOY_ORG_ID` | Tower Cloud organization ID |
| `DEPLOY_CONTAINER_NAME` | Container instance name |
| `DEPLOY_REGISTRY_URL` | Tower Container Registry URL (e.g. `test2.hyd.cr.tower.cloud`) |
| `DEPLOY_REGISTRY_USERNAME` | Registry username |
| `DEPLOY_REGISTRY_PASSWORD` | Registry password |
| `DEPLOY_REGISTRY_REPO` | Repository path in registry (e.g. `my-org/my-app`) |

**Variables:**

| Variable Name | Description |
|---------------|-------------|
| `DEPLOY_GATEWAY_URL` | Tower Cloud API gateway URL (provided by administrator) |

## Usage

### Deploy on Every Push to Main

```yml
name: Deploy to Tower Cloud

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    env:
      IMAGE_TAG: ${{ secrets.DEPLOY_REGISTRY_URL }}/${{ secrets.DEPLOY_REGISTRY_REPO }}:${{ github.sha }}

    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ${{ secrets.DEPLOY_REGISTRY_URL }}
          username: ${{ secrets.DEPLOY_REGISTRY_USERNAME }}
          password: ${{ secrets.DEPLOY_REGISTRY_PASSWORD }}

      - uses: docker/build-push-action@v5
        with:
          push: true
          platforms: linux/amd64
          tags: ${{ env.IMAGE_TAG }}

      - name: Deploy to Tower Cloud
        uses: vinayteja-31/worflow-service@main
        with:
          tower-api-url: ${{ vars.DEPLOY_GATEWAY_URL }}
          tower-user: ${{ secrets.DEPLOY_IAM_USERNAME }}
          tower-password: ${{ secrets.DEPLOY_IAM_PASSWORD }}
          organization-id: ${{ secrets.DEPLOY_ORG_ID }}
          container-name: ${{ secrets.DEPLOY_CONTAINER_NAME }}
          image: ${{ env.IMAGE_TAG }}
          registry-username: ${{ secrets.DEPLOY_REGISTRY_USERNAME }}
          registry-password: ${{ secrets.DEPLOY_REGISTRY_PASSWORD }}
```

### Deploy a Pre-Built Image

```yml
- name: Deploy to Tower Cloud
  uses: vinayteja-31/worflow-service@main
  with:
    tower-api-url: ${{ vars.DEPLOY_GATEWAY_URL }}
    tower-user: ${{ secrets.DEPLOY_IAM_USERNAME }}
    tower-password: ${{ secrets.DEPLOY_IAM_PASSWORD }}
    organization-id: ${{ secrets.DEPLOY_ORG_ID }}
    container-name: ${{ secrets.DEPLOY_CONTAINER_NAME }}
    image: test2.hyd.cr.tower.cloud/my-org/my-app:v1.2.0
    registry-username: ${{ secrets.DEPLOY_REGISTRY_USERNAME }}
    registry-password: ${{ secrets.DEPLOY_REGISTRY_PASSWORD }}
```

### Manual Trigger

```yml
name: Deploy to Tower Cloud

on:
  workflow_dispatch:
    inputs:
      image:
        description: 'Full image URI to deploy'
        required: true
        type: string

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Tower Cloud
        uses: vinayteja-31/worflow-service@main
        with:
          tower-api-url: ${{ vars.DEPLOY_GATEWAY_URL }}
          tower-user: ${{ secrets.DEPLOY_IAM_USERNAME }}
          tower-password: ${{ secrets.DEPLOY_IAM_PASSWORD }}
          organization-id: ${{ secrets.DEPLOY_ORG_ID }}
          container-name: ${{ secrets.DEPLOY_CONTAINER_NAME }}
          image: ${{ inputs.image }}
          registry-username: ${{ secrets.DEPLOY_REGISTRY_USERNAME }}
          registry-password: ${{ secrets.DEPLOY_REGISTRY_PASSWORD }}
```

## How the Image Tag Works

Every deployment uses a unique, immutable image tag based on the Git commit SHA:

```
{registry_url}/{repository}:{commit_sha}
```

For example: `test2.hyd.cr.tower.cloud/my-org/my-app:a1b2c3d4e5f6`

This ensures every deployment is traceable to a specific commit, and rollbacks are straightforward by redeploying with a previous SHA.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `IAM login failed (HTTP 400)` | Check `DEPLOY_IAM_USERNAME`, `DEPLOY_IAM_PASSWORD`, `DEPLOY_ORG_ID` |
| `Container not found` | Create the container instance first in the Tower Cloud portal |
| `Container update failed (HTTP 500)` | Ensure `image` is in `registry/repo:tag` format |
| `Container update failed (HTTP 401)` | Check IAM credentials and org ID |

## License

MIT
