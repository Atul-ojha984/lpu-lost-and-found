# MongoDB Atlas Connection Guide: LPU Lost & Found

**System:** LPU Lost & Found Property Recovery Platform  
**Target Environment:** Local Dev, Staging & Render Production  

---

## 1. Connection String Specifications

MongoDB Atlas uses the DNS Seedlist connection format (`mongodb+srv://`).

### Standard Format
```text
mongodb+srv://<username>:<password>@<cluster-address>.mongodb.net/<database>?retryWrites=true&w=majority
```

### Parameter Explanations
- **`mongodb+srv://`**: Automatically resolves the cluster's replica set member hostnames and enables TLS/SSL by default.
- **`<username>:<password>`**: Database credentials created under **Database Access** in MongoDB Atlas. *(Ensure special characters in the password are URL-encoded).*
- **`<cluster-address>`**: The primary hostname provided by Atlas (e.g. `cluster0.abcde.mongodb.net`).
- **`<database>`**: Target database name (`lpu_lost_found`).
- **`retryWrites=true`**: Automatically retries transient write operations if a replica set primary election occurs.
- **`w=majority`**: Requests acknowledgement that write operations have propagated to a majority of replica set nodes for durable consistency.

---

## 2. Environment Variables Reference

| Variable Name | Required | Example Value | Description |
| :--- | :-: | :--- | :--- |
| **`MONGODB_URI`** | **Yes** | `mongodb+srv://app_user:Secr3t@cluster0.abc.mongodb.net/lpu_lost_found?retryWrites=true&w=majority` | Full Atlas connection string |
| **`MONGODB_DATABASE`** | **Yes** | `lpu_lost_found` | Application database namespace |

> [!CAUTION]
> **Security Rules:**
> 1. Never commit `.env` files containing actual passwords to GitHub.
> 2. Never prefix MongoDB connection strings with `NEXT_PUBLIC_` (which would leak credentials to client browser bundles).
> 3. Store `MONGODB_URI` securely in the hosting dashboard (e.g., Render Environment Variables).

---

## 3. Backend Driver Connection Tuning

### Node.js (Mongoose 8)
Configured in [`apps/api/src/config/database.ts`](file:///c:/Users/kumar/Downloads/lpu-lost-and-found-main/lpu-lost-and-found-main/apps/api/src/config/database.ts):
```typescript
await mongoose.connect(env.MONGODB_URI, {
  dbName: env.MONGODB_DATABASE,
  serverSelectionTimeoutMS: 10000, // 10s for Atlas DNS lookups
  socketTimeoutMS: 45000,          // 45s socket timeout
  maxPoolSize: 20,                 // Up to 20 concurrent sockets
  minPoolSize: 2,                  // Keep 2 warm sockets alive
  autoIndex: env.NODE_ENV !== 'production',
});
```

### Python (Django MongoDB Backend)
Configured in [`backend/config/settings_mongodb.py`](file:///c:/Users/kumar/Downloads/lpu-lost-and-found-main/lpu-lost-and-found-main/backend/config/settings_mongodb.py):
```python
DATABASES = {
    'default': {
        'ENGINE': 'django_mongodb_backend',
        'HOST': MONGODB_URI,
        'NAME': MONGODB_DATABASE,
        'OPTIONS': {'retryWrites': 'true', 'w': 'majority'},
    }
}
```

---

## 4. Troubleshooting Atlas Connections

1. **`MongooseServerSelectionError: connection timed out`**:
   - Cause: IP whitelist blocking the connection.
   - Fix: In MongoDB Atlas -> **Network Access**, ensure your current IP address (or `0.0.0.0/0` for cloud deployment) is added and status shows **Active**.
2. **`MongoServerError: Authentication failed`**:
   - Cause: Invalid username, incorrect password, or special characters not URL-encoded.
   - Fix: Double-check user in **Database Access**; URL-encode characters like `@`, `:`, `/`, or `%`.
3. **`MongoTopologyClosedError`**:
   - Cause: Application attempted queries after connection was closed.
   - Fix: Verify `connectDatabase()` resolves before routing requests (handled in `server.ts`).
