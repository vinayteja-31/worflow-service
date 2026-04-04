# Tower Cloud Container Deploy Action

GitHub Action for deploying container images to [Tower Cloud](https://console.tower.cloud) Container Instances. Build, push, and update your container instance with a new image on every commit.

## Prerequisites

Before using this action, you need:

- A **Tower Cloud account** with an organization
- An existing **Container Instance** in Tower Cloud
- A **Tower Container Registry (TCR)** with a repository and at least one image tag

> **First-time setup:** The container instance must already exist in Tower Cloud before this action can deploy to it. To create one, push your first image to the registry manually (or run the workflow without the deploy step), then create the container instance in the [Tower Cloud portal](https://tower.cloud/) by selecting that repository and tag.

## Arguments

### Required

| Argument | Description |
|----------|-------------|
| `tower-user` | Tower Cloud IAM username |
| `tower-password` | Tower Cloud IAM password |
| `organization-id` | Tower Cloud organization ID (UUID) |
| `container-name` | Name of the existing container instance to update |

### Optional

| Argument | Description |
|----------|-------------|
| `image` | Full image URI to deploy (e.g. `test2.hyd.cr.tower.cloud/my-org/my-app:abc123`). If not provided, auto-generates as `{registry-url}/{registry-repo}:{github-sha}`. |
| `registry-url` | Container registry URL (e.g. `test2.hyd.cr.tower.cloud`). Required if `image` is not provided. |
| `registry-repo` | Repository path in registry (e.g. `my-org/my-app`). Auto-generates as `{github-repo-name}/{container-name}` if not provided. |
| `registry-username` | Registry username for Tower or private registries |
| `registry-password` | Registry password for Tower or private registries |

### Outputs

| Output | Description |
|--------|-------------|
| `status` | Deployment status (`accepted`) |
| `image` | The image URI that was deployed |
| `task-id` | Deployment task ID returned by Tower Cloud |

## Setting Up Secrets

In your GitHub repository, go to **Settings > Secrets and variables > Actions > Secrets** and add:

| Secret Name | Required | Description |
|-------------|----------|-------------|
| `DEPLOY_IAM_USERNAME` | Yes | Tower Cloud IAM username |
| `DEPLOY_IAM_PASSWORD` | Yes | Tower Cloud IAM password |
| `DEPLOY_ORG_ID` | Yes | Tower Cloud organization ID |
| `DEPLOY_CONTAINER_NAME` | Yes | Container instance name |
| `DEPLOY_REGISTRY_URL` | Yes | Tower Container Registry URL (e.g. `test2.hyd.cr.tower.cloud`) |
| `DEPLOY_REGISTRY_USERNAME` | Yes | Registry username |
| `DEPLOY_REGISTRY_PASSWORD` | Yes | Registry password |
| `DEPLOY_REGISTRY_REPO` | Optional | Repository path in registry (e.g. `my-org/my-app`). Auto-generates as `{repo-name}/{container-name}` if not set. |

> **Note:** No variables need to be configured. The API gateway URL is managed internally by the action.

## Usage

### Deploy on Every Push to Main

```yml
name: Deploy to Tower Cloud

on:
  push:
    branches: [main]

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    env:
      IMAGE_TAG: ${{ secrets.DEPLOY_REGISTRY_URL }}/${{ secrets.DEPLOY_REGISTRY_REPO || format('{0}/{1}', github.event.repository.name, secrets.DEPLOY_CONTAINER_NAME) }}:${{ github.sha }}

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
