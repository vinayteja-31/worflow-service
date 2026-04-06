# Tower Cloud Container Deploy Action

GitHub Action for deploying container images to [Tower Cloud](https://console.tower.cloud) Container Instances. Build, push, and update your container instance with a new image on every commit.

## Prerequisites

Before using this action, you need:

- A **Tower Cloud account** with an organization
- An existing **Container Instance** in Tower Cloud
- A container image in a **Tower**, **public**, or **private** registry

> **First-time setup:** The container instance must already exist in Tower Cloud before this action can deploy to it. To create one, push your first image to the registry manually (or run the workflow without the deploy step), then create the container instance in the [Tower Cloud portal](https://tower.cloud/) by selecting that repository and tag.

## Supported Registry Types

This action supports three types of container registries:

| | Tower Registry | Public Registry | Private Registry |
|---|---|---|---|
| **Example** | `test2.hyd.cr.tower.cloud` | `docker.io` | `ghcr.io`, AWS ECR, Azure ACR |
| **Authentication** | Uses IAM credentials (no separate registry creds needed) | No credentials needed | Requires `registry-username` and `registry-password` |
| **Build & push in workflow** | Yes | No (image already exists) | Yes |

## Arguments

### Required (all registry types)

| Argument | Description |
|----------|-------------|
| `tower-user` | Tower Cloud IAM username |
| `tower-password` | Tower Cloud IAM password |
| `organization-id` | Tower Cloud organization ID (UUID) |
| `container-name` | Name of the existing container instance to update |

### Optional

| Argument | Tower Registry | Public Registry | Private Registry |
|----------|----------------|-----------------|------------------|
| `image` | Optional (auto-generates from registry-url + SHA) | Required | Optional (auto-generates from registry-url + SHA) |
| `registry-url` | Required if `image` not provided | Not needed | Required if `image` not provided |
| `registry-repo` | Optional (auto-generates as `{repo-name}/{container-name}`) | Not needed | Optional (auto-generates as `{repo-name}/{container-name}`) |
| `registry-username` | Not needed | Not needed | Required |
| `registry-password` | Not needed | Not needed | Required |

### Outputs

| Output | Description |
|--------|-------------|
| `status` | Deployment status (`accepted`) |
| `image` | The image URI that was deployed |
| `task-id` | Deployment task ID returned by Tower Cloud |

## Setting Up Secrets and Variables

In your GitHub repository, go to **Settings > Secrets and variables > Actions**.

### Secrets

| Secret Name | Tower Registry | Public Registry | Private Registry | Description |
|-------------|:-:|:-:|:-:|-------------|
| `DEPLOY_IAM_USERNAME` | Required | Required | Required | Tower Cloud IAM username |
| `DEPLOY_IAM_PASSWORD` | Required | Required | Required | Tower Cloud IAM password |
| `DEPLOY_REGISTRY_USERNAME` | — | — | Required | Registry username |
| `DEPLOY_REGISTRY_PASSWORD` | — | — | Required | Registry password |

### Variables

| Variable Name | Tower Registry | Public Registry | Private Registry | Description |
|---------------|:-:|:-:|:-:|-------------|
| `DEPLOY_ORG_ID` | Required | Required | Required | Tower Cloud organization ID |
| `DEPLOY_CONTAINER_NAME` | Required | Required | Required | Container instance name |
| `DEPLOY_REGISTRY_URL` | Required | — | Required | Registry URL (e.g. `test2.hyd.cr.tower.cloud`, `ghcr.io`) |
| `DEPLOY_REGISTRY_REPO` | Optional | — | Optional | Repository path (auto-generates as `{repo-name}/{container-name}` if not set) |

> **Note:** The API gateway URL is managed internally by the action — no additional configuration needed.
> For Tower registry, IAM credentials are automatically used for registry authentication — no separate registry credentials needed.

## Usage

### Build, Push, and Deploy (Tower / Private Registry)

This single workflow works for both Tower and private registries. For Tower registry, it auto-falls back to IAM credentials. For private registry, set `DEPLOY_REGISTRY_USERNAME` and `DEPLOY_REGISTRY_PASSWORD` in secrets.

```yml
name: Deploy to Tower Cloud

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    env:
      IMAGE_TAG: ${{ vars.DEPLOY_REGISTRY_URL }}/${{ vars.DEPLOY_REGISTRY_REPO || format('{0}/{1}', github.event.repository.name, vars.DEPLOY_CONTAINER_NAME) }}:${{ github.sha }}

    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ${{ vars.DEPLOY_REGISTRY_URL }}
          username: ${{ secrets.DEPLOY_REGISTRY_USERNAME || secrets.DEPLOY_IAM_USERNAME }}
          password: ${{ secrets.DEPLOY_REGISTRY_PASSWORD || secrets.DEPLOY_IAM_PASSWORD }}

      - uses: docker/build-push-action@v5
        with:
          push: true
          platforms: linux/amd64
          tags: ${{ env.IMAGE_TAG }}

      - name: Deploy to Tower Cloud
        uses: vinayteja-31/worflow-service@main
        with:
          tower-user: ${{ secrets.DEPLOY_IAM_USERNAME }}
          tower-password: ${{ secrets.DEPLOY_IAM_PASSWORD }}
          organization-id: ${{ vars.DEPLOY_ORG_ID }}
          container-name: ${{ vars.DEPLOY_CONTAINER_NAME }}
          image: ${{ env.IMAGE_TAG }}
          registry-username: ${{ secrets.DEPLOY_REGISTRY_USERNAME }}
          registry-password: ${{ secrets.DEPLOY_REGISTRY_PASSWORD }}
```

### Public Registry — Deploy an Existing Image

No build/push step needed — just deploy a publicly available image.

```yml
- name: Deploy to Tower Cloud
  uses: vinayteja-31/worflow-service@main
  with:
    tower-user: ${{ secrets.DEPLOY_IAM_USERNAME }}
    tower-password: ${{ secrets.DEPLOY_IAM_PASSWORD }}
    organization-id: ${{ vars.DEPLOY_ORG_ID }}
    container-name: ${{ vars.DEPLOY_CONTAINER_NAME }}
    image: docker.io/library/nginx:latest
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
