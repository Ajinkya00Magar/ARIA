# IBM Cloud Setup Guide

This guide walks you through provisioning every IBM Cloud service required by IBM Coding Agent, and explains exactly where to find each credential.

---

## 1. IBM Cloud Account

1. Go to [cloud.ibm.com](https://cloud.ibm.com)
2. Sign up for a free account (Lite tier available)
3. Verify your email

---

## 2. IBM Cloud API Key

**Used for**: Authenticating all IBM Cloud service calls.

1. Log into [cloud.ibm.com](https://cloud.ibm.com)
2. Click **Manage** → **Access (IAM)** in the top navigation
3. Select **API keys** from the left menu
4. Click **Create an IBM Cloud API key**
5. Give it a name (e.g., `ibm-coding-agent`)
6. Copy the API key (you can only see it once!)

```bash
IBM_CLOUD_API_KEY=your_copied_api_key
```

---

## 3. Watson Machine Learning (watsonx.ai)

**Used for**: Running IBM Granite Code language model.

### 3a. Create Watson Machine Learning instance

1. Go to [cloud.ibm.com/catalog](https://cloud.ibm.com/catalog)
2. Search for **Watson Machine Learning**
3. Select the **Lite** plan (free tier allows development use)
4. Click **Create**

### 3b. Create watsonx project

1. Go to [dataplatform.ibm.com](https://dataplatform.ibm.com)
2. Click **New project** → **Create an empty project**
3. Enter project name: `ibm-coding-agent`
4. In the project's **Settings** tab, copy the **Project ID**

```bash
IBM_PROJECT_ID=your_project_id_here
IBM_WATSONX_URL=https://us-south.ml.cloud.ibm.com  # Adjust region if needed
IBM_REGION=us-south
```

### 3c. Available Granite Code Models

| Model ID | Params | Best For |
|----------|--------|----------|
| `ibm/granite-34b-code-instruct` | 34B | Most capable, production |
| `ibm/granite-20b-code-instruct` | 20B | Good balance |
| `ibm/granite-8b-code-instruct` | 8B | Faster, lower cost |
| `ibm/granite-3b-code-instruct` | 3B | Fastest, prototyping |

```bash
IBM_MODEL_ID=ibm/granite-34b-code-instruct
```

---

## 4. IBM Cloud Databases for PostgreSQL

**Used for**: Storing users, workspaces, chats, messages, tasks, memories.

1. [cloud.ibm.com/catalog](https://cloud.ibm.com/catalog) → **Databases for PostgreSQL**
2. Choose plan (Standard or Lite)
3. Select region (same as watsonx — `us-south`)
4. Click **Create**
5. Once provisioned → **Service credentials** → **New credential**
6. Click **Add** → expand the credential to see the connection URL

```bash
DATABASE_URL=postgresql://admin:password@host:port/database?sslmode=require
```

### Enable pgvector extension

Connect to your PostgreSQL instance and run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run the migrations:
```bash
psql $DATABASE_URL -f apps/api/migrations/001_initial.sql
```

---

## 5. IBM Cloud Object Storage

**Used for**: Storing workspace files and uploaded assets.

1. [cloud.ibm.com/catalog](https://cloud.ibm.com/catalog) → **Cloud Object Storage**
2. Plan: **Lite** (25GB free) or **Standard**
3. Click **Create**
4. Create a bucket: `ibm-coding-agent-workspaces`
5. **Service credentials** → **New credential** → Enable **Include HMAC credential**
6. Expand the credential → copy `cos_hmac_keys.access_key_id` and `secret_access_key`

```bash
IBM_OBJECT_STORAGE_ENDPOINT=https://s3.us-south.cloud-object-storage.appdomain.cloud
IBM_OBJECT_STORAGE_API_KEY=your_api_key
IBM_BUCKET=ibm-coding-agent-workspaces
```

---

## 6. IBM Secrets Manager

**Used for**: Securely storing GitHub tokens and API keys.

1. [cloud.ibm.com/catalog](https://cloud.ibm.com/catalog) → **Secrets Manager**
2. Plan: **Trial** (free 30 days) or **Standard**
3. Click **Create**
4. From the service dashboard, copy the **Instance URL** (shown on the Welcome page)

```bash
IBM_SECRET_MANAGER_URL=https://your-instance.us-south.secrets-manager.appdomain.cloud
IBM_SECRET_MANAGER_API_KEY=$IBM_CLOUD_API_KEY  # Same key, or create dedicated one
```

---

## 7. IBM Cloud Code Engine (Deployment)

**Used for**: Running containers in serverless mode.

1. [cloud.ibm.com/catalog](https://cloud.ibm.com/catalog) → **Code Engine**
2. Click **Start creating** → **Create project**
3. Project name: `ibm-coding-agent`
4. Click **Create**

### IBM Container Registry

For pushing Docker images:
1. [cloud.ibm.com](https://cloud.ibm.com) → **Container Registry**
2. Set region: `us.icr.io` (US South)
3. Create namespace: `ibm-coding-agent`

```bash
# Push images
ibmcloud cr login
ibmcloud cr region-set us-south
docker tag my-image us.icr.io/ibm-coding-agent/my-image:latest
docker push us.icr.io/ibm-coding-agent/my-image:latest
```

---

## 8. IBM App ID (Optional — Enterprise SSO)

**Used for**: Enterprise authentication with SAML, OIDC, social login.

1. [cloud.ibm.com/catalog](https://cloud.ibm.com/catalog) → **App ID**
2. Plan: **Lite** or **Graduated Tier**
3. Click **Create**
4. From the App ID dashboard, copy:
   - **Tenant ID** (in the URL: `us-south.appid.cloud.ibm.com/oauth/v4/YOUR_TENANT_ID`)
   - **Client ID** → Service credentials → New credential
   - **Client Secret** → Service credentials

```bash
IBM_APPID_TENANT_ID=your_tenant_id
IBM_APPID_CLIENT_ID=your_client_id
IBM_APPID_CLIENT_SECRET=your_client_secret
IBM_APPID_OAUTH_SERVER_URL=https://us-south.appid.cloud.ibm.com/oauth/v4/your-tenant-id
```

---

## 9. GitHub OAuth (for GitHub login)

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: IBM Coding Agent
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3001/api/auth/callback/github`
4. Click **Register application**
5. Copy **Client ID** and generate **Client Secret**

```bash
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

---

## 10. Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
4. Application type: **Web application**
5. Authorized redirect URIs: `http://localhost:3001/api/auth/callback/google`
6. Copy **Client ID** and **Client Secret**

```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

---

## Quick Credentials Checklist

| Variable | Source | Required |
|----------|--------|----------|
| `IBM_CLOUD_API_KEY` | IAM → API Keys | ✅ |
| `IBM_PROJECT_ID` | watsonx project settings | ✅ |
| `IBM_WATSONX_URL` | region endpoint | ✅ |
| `IBM_MODEL_ID` | model catalog | ✅ |
| `DATABASE_URL` | PostgreSQL service credentials | ✅ |
| `JWT_SECRET` | generate with `openssl rand -base64 64` | ✅ |
| `JWT_REFRESH_SECRET` | generate with `openssl rand -base64 64` | ✅ |
| `IBM_OBJECT_STORAGE_ENDPOINT` | COS service credentials | Optional |
| `IBM_SECRET_MANAGER_URL` | Secrets Manager dashboard | Optional |
| `IBM_CLOUDANT_URL` | Cloudant service credentials | Optional |
| `GITHUB_CLIENT_ID` | GitHub OAuth App | Optional |
| `GOOGLE_CLIENT_ID` | Google Cloud Console | Optional |

---

## Generating JWT Secrets

```bash
# Generate strong secrets
openssl rand -base64 64
```

Paste the output into `JWT_SECRET` and `JWT_REFRESH_SECRET` (use different values for each).
