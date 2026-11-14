"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Production End-to-End Testing & Validation Suite
Testing across: Vercel (Frontend), Render (Backend API), MongoDB Atlas (Database)
==============================================================================
"""

import json
import time
import urllib.request
import urllib.error
import urllib.parse
import ssl
from datetime import datetime, timezone

BACKEND_URL = "https://lpu-lost-found-backend-django-zf75.onrender.com"
API_BASE = f"{BACKEND_URL}/api/v1"
FRONTEND_URL = "https://lpu-lost-and-found-lac.vercel.app"

STUDENT_CREDS = {"emailOrRegNo": "student@lpu.co.in", "password": "Student@12345"}
SECURITY_CREDS = {"emailOrRegNo": "security@lpu.co.in", "password": "Security@12345"}
ADMIN_CREDS = {"emailOrRegNo": "admin@lpu.co.in", "password": "Admin@12345"}

results = {
    "summary": {"total": 0, "passed": 0, "failed": 0, "skipped": 0},
    "latencies": [],
    "tests": [],
}

def log_test(category, name, passed, status_code, latency_ms, details=None):
    results["summary"]["total"] += 1
    if passed:
        results["summary"]["passed"] += 1
        status_str = "PASS"
    else:
        results["summary"]["failed"] += 1
        status_str = "FAIL"

    record = {
        "category": category,
        "name": name,
        "status": status_str,
        "http_status": status_code,
        "latency_ms": round(latency_ms, 1),
        "details": details or "",
    }
    results["tests"].append(record)
    results["latencies"].append(latency_ms)
    print(f"[{status_str}] ({status_code}) {category} :: {name} - {latency_ms:.0f}ms")
    if not passed and details:
        print(f"       Details: {details}")

def make_request(method, url, data=None, token=None, headers=None, expected_status=None):
    if headers is None:
        headers = {}
    headers.setdefault("User-Agent", "LPU-E2E-Automated-Tester/2.0")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if data is not None and "Content-Type" not in headers:
        headers["Content-Type"] = "application/json"
        if isinstance(data, (dict, list)):
            data = json.dumps(data).encode("utf-8")
        elif isinstance(data, str):
            data = data.encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            latency = (time.time() - start_time) * 1000
            body = resp.read().decode("utf-8")
            try:
                parsed = json.loads(body)
            except Exception:
                parsed = body
            return resp.status, parsed, latency, resp.headers
    except urllib.error.HTTPError as e:
        latency = (time.time() - start_time) * 1000
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = body
        return e.code, parsed, latency, e.headers
    except Exception as e:
        latency = (time.time() - start_time) * 1000
        return 0, str(e), latency, {}

# ----------------------------------------------------------------------
# Run Test Suites
# ----------------------------------------------------------------------

def run_all_tests():
    print(f"\n=======================================================")
    print(f"STARTING COMPREHENSIVE PRODUCTION TEST RUN")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print(f"Backend Target: {API_BASE}")
    print(f"Frontend Target: {FRONTEND_URL}")
    print(f"=======================================================\n")

    # ------------------------------------------------------------------
    # 1. Environment & API Base Health
    # ------------------------------------------------------------------
    status, body, lat, headers = make_request("GET", f"{API_BASE}/health")
    db_info = body.get("data", {}).get("database", {}) if isinstance(body, dict) else {}
    passed = status == 200 and db_info.get("connected") is True
    log_test("Core Health", "Health Check & MongoDB Connection", passed, status, lat, f"Vendor: {db_info.get('vendor')} (DB: {db_info.get('name')})")

    status, body, lat, headers = make_request("GET", f"{API_BASE}/")
    log_test("Core Health", "Service Discovery Root (/api/v1/)", status == 200, status, lat)

    status, body, lat, headers = make_request("GET", f"{BACKEND_URL}/api/schema/")
    log_test("Documentation", "OpenAPI Schema JSON", status == 200, status, lat)

    # ------------------------------------------------------------------
    # 2. Authentication Flow & Role Verification
    # ------------------------------------------------------------------
    # Student Login
    status, body, lat, headers = make_request("POST", f"{API_BASE}/auth/login/", data=STUDENT_CREDS)
    student_token = (body.get("data", {}).get("accessToken") or body.get("data", {}).get("token")) if isinstance(body, dict) else None
    refresh_token = (body.get("data", {}).get("refreshToken") or body.get("data", {}).get("refresh")) if isinstance(body, dict) else None
    passed = status == 200 and bool(student_token)
    log_test("Auth: Student", "Student Login via Email", passed, status, lat)

    # Student Me
    status, body, lat, headers = make_request("GET", f"{API_BASE}/auth/me/", token=student_token)
    user_data = body.get("data", {}).get("user", {}) if isinstance(body, dict) else {}
    passed = status == 200 and user_data.get("email") == STUDENT_CREDS["emailOrRegNo"]
    log_test("Auth: Student", "Student Profile /auth/me/", passed, status, lat)

    # Token Refresh
    if refresh_token:
        status, body, lat, headers = make_request("POST", f"{API_BASE}/auth/token/refresh/", data={"refresh": refresh_token})
        new_token = (body.get("access") or body.get("data", {}).get("accessToken") or body.get("data", {}).get("access")) if isinstance(body, dict) else None
        log_test("Auth: Token", "Token Refresh /auth/token/refresh/", status == 200 and bool(new_token), status, lat)
    else:
        log_test("Auth: Token", "Token Refresh /auth/token/refresh/", False, 0, 0, "No refresh token issued")

    # Security Officer Login
    status, body, lat, headers = make_request("POST", f"{API_BASE}/auth/login/", data=SECURITY_CREDS)
    security_token = (body.get("data", {}).get("accessToken") or body.get("data", {}).get("token")) if isinstance(body, dict) else None
    passed = status == 200 and bool(security_token)
    log_test("Auth: Security", "Security Officer Login via Email", passed, status, lat)

    # Security Me
    status, body, lat, headers = make_request("GET", f"{API_BASE}/auth/me/", token=security_token)
    user_data = body.get("data", {}).get("user", {}) if isinstance(body, dict) else {}
    passed = status == 200 and user_data.get("role") == "SECURITY_PERSONNEL"
    log_test("Auth: Security", "Security Profile & Role Verification", passed, status, lat)

    # Admin Login
    status, body, lat, headers = make_request("POST", f"{API_BASE}/auth/login/", data=ADMIN_CREDS)
    admin_token = (body.get("data", {}).get("accessToken") or body.get("data", {}).get("token")) if isinstance(body, dict) else None
    passed = status == 200 and bool(admin_token)
    log_test("Auth: Admin", "Campus Admin Login via Email", passed, status, lat)

    # Admin Me
    status, body, lat, headers = make_request("GET", f"{API_BASE}/auth/me/", token=admin_token)
    user_data = body.get("data", {}).get("user", {}) if isinstance(body, dict) else {}
    passed = status == 200 and user_data.get("role") == "CAMPUS_ADMIN"
    log_test("Auth: Admin", "Admin Profile & Role Verification", passed, status, lat)

    # ------------------------------------------------------------------
    # 3. RBAC & Security Authorization Barriers
    # ------------------------------------------------------------------
    # Unauthenticated access to /admin/audit-logs/
    status, body, lat, headers = make_request("GET", f"{API_BASE}/admin/audit-logs/")
    log_test("RBAC Barriers", "Unauthenticated blocked from /admin/audit-logs/ (Expect 401)", status == 401, status, lat)

    # Student blocked from /admin/audit-logs/
    status, body, lat, headers = make_request("GET", f"{API_BASE}/admin/audit-logs/", token=student_token)
    log_test("RBAC Barriers", "Student blocked from /admin/audit-logs/ (Expect 403)", status == 403, status, lat)

    # Security Officer blocked from /admin/audit-logs/
    status, body, lat, headers = make_request("GET", f"{API_BASE}/admin/audit-logs/", token=security_token)
    log_test("RBAC Barriers", "Security Officer blocked from /admin/audit-logs/ (Expect 403)", status == 403, status, lat)

    # Student blocked from /custody/inventory/
    status, body, lat, headers = make_request("GET", f"{API_BASE}/custody/inventory/", token=student_token)
    log_test("RBAC Barriers", "Student blocked from /custody/inventory/ (Expect 403)", status == 403, status, lat)

    # Public Self-Registration Barrier (Campus policy requires approved provisioning)
    status, body, lat, headers = make_request("POST", f"{API_BASE}/auth/register/", data={"email": "attacker@lpu.co.in", "password": "Pass@123Attacker", "registrationNumber": "12999999", "fullName": "Attacker"})
    log_test("RBAC Barriers", "Self-Registration policy check (Expect 403)", status == 403, status, lat)

    # ------------------------------------------------------------------
    # 4. Taxonomy & Taxonomy API
    # ------------------------------------------------------------------
    status, body, lat, headers = make_request("GET", f"{API_BASE}/categories/", token=student_token)
    raw_cats = body.get("data", []) if isinstance(body, dict) else []
    cat_items = raw_cats if isinstance(raw_cats, list) else raw_cats.get("categories", [])
    cat_count = len(cat_items)
    log_test("Taxonomy", "List Categories (Authenticated)", status == 200 and cat_count >= 24, status, lat, f"Categories count: {cat_count}")
    sample_cat_id = cat_items[0]["id"] if cat_items else None

    status, body, lat, headers = make_request("GET", f"{API_BASE}/locations/", token=student_token)
    raw_locs = body.get("data", []) if isinstance(body, dict) else []
    loc_items = raw_locs if isinstance(raw_locs, list) else raw_locs.get("locations", [])
    loc_count = len(loc_items)
    log_test("Taxonomy", "List Locations (Authenticated)", status == 200 and loc_count >= 25, status, lat, f"Locations count: {loc_count}")
    sample_loc_id = loc_items[0]["id"] if loc_items else None

    # ------------------------------------------------------------------
    # 5. Items Public Board, Detail, Challenges & Reporting
    # ------------------------------------------------------------------
    status, body, lat, headers = make_request("GET", f"{API_BASE}/items/?page=1&limit=10", token=student_token)
    data_obj = body.get("data", {}) if isinstance(body, dict) else {}
    items_list = data_obj.get("items", []) if isinstance(data_obj, dict) else (data_obj if isinstance(data_obj, list) else [])
    total_items = data_obj.get("pagination", {}).get("totalItems", len(items_list)) if isinstance(data_obj, dict) else len(items_list)
    passed = status == 200 and total_items > 0
    log_test("Items Board", "Public Board List & Pagination", passed, status, lat, f"Total items on board: {total_items}")
    first_item_id = items_list[0]["id"] if items_list else None

    # Filter items by type=FOUND
    status, body, lat, headers = make_request("GET", f"{API_BASE}/items/?itemType=FOUND&limit=5", token=student_token)
    log_test("Items Board", "Filter by itemType=FOUND", status == 200, status, lat)

    # Filter items by search query
    status, body, lat, headers = make_request("GET", f"{API_BASE}/items/?search=calculator&limit=5", token=student_token)
    log_test("Items Board", "Search query filter (search=calculator)", status == 200, status, lat)

    # Item Detail
    if first_item_id:
        status, body, lat, headers = make_request("GET", f"{API_BASE}/items/{first_item_id}/", token=student_token)
        passed = status == 200 and isinstance(body, dict) and body.get("data", {}).get("id") == first_item_id
        log_test("Items Detail", f"Item Detail View (/items/{first_item_id}/)", passed, status, lat)

        # Verification Challenges for Item
        status, body, lat, headers = make_request("GET", f"{API_BASE}/items/{first_item_id}/challenges/", token=student_token)
        log_test("Items Detail", f"Item Verification Challenges (/items/{first_item_id}/challenges/)", status == 200, status, lat)
    else:
        log_test("Items Detail", "Item Detail View", False, 0, 0, "No item found on board")

    # My Reports
    status, body, lat, headers = make_request("GET", f"{API_BASE}/items/my-reports/", token=student_token)
    log_test("Items Reporting", "User Filed Reports (/items/my-reports/)", status == 200, status, lat)

    # Daily Lost Report Limit Check
    status, body, lat, headers = make_request("GET", f"{API_BASE}/items/daily-lost-report-limit/", token=student_token)
    log_test("Items Reporting", "Daily Lost Report Limit Status", status == 200, status, lat)

    # Create Lost Report (Safe functional test)
    if sample_cat_id and sample_loc_id:
        test_lost_payload = {
            "title": "E2E Test Misplaced Blue Water Bottle",
            "category": sample_cat_id,
            "location": sample_loc_id,
            "specificLocation": "Central Library Reading Hall Desk 42",
            "eventDate": "2026-11-14T09:00:00Z",
            "publicDescription": "Stainless steel 750ml blue thermos bottle misplaced during test session.",
            "privateIdentifyingDetails": "Distinctive sticker with test initials E2E on bottom rim.",
            "itemType": "LOST"
        }
        status, body, lat, headers = make_request("POST", f"{API_BASE}/items/lost/", data=test_lost_payload, token=student_token)
        created_lost_id = body.get("data", {}).get("id") if isinstance(body, dict) else None
        passed = status in (200, 201) and bool(created_lost_id)
        log_test("Items Reporting", "Submit Lost Property Report (/items/lost/)", passed, status, lat, f"Created ID: {created_lost_id}")

        # Withdraw Lost Report (Cleanup)
        if created_lost_id:
            status, body, lat, headers = make_request("DELETE", f"{API_BASE}/items/{created_lost_id}/withdraw/", token=student_token)
            log_test("Items Reporting", f"Withdraw Lost Report Cleanup (/items/{created_lost_id}/withdraw/)", status == 200, status, lat)
    else:
        log_test("Items Reporting", "Submit Lost Property Report", False, 0, 0, "Missing sample category/location")

    # ------------------------------------------------------------------
    # 6. Claims Workflow
    # ------------------------------------------------------------------
    status, body, lat, headers = make_request("GET", f"{API_BASE}/claims/my-claims/", token=student_token)
    c_data = body.get("data", []) if isinstance(body, dict) else []
    my_claims = c_data if isinstance(c_data, list) else c_data.get("claims", [])
    log_test("Claims", "User My Claims (/claims/my-claims/)", status == 200, status, lat, f"Claims count: {len(my_claims)}")

    status, body, lat, headers = make_request("GET", f"{API_BASE}/claims/pending/", token=security_token)
    p_data = body.get("data", []) if isinstance(body, dict) else []
    pending_claims = p_data if isinstance(p_data, list) else p_data.get("claims", [])
    log_test("Claims: Security", "Security Pending Claims Queue (/claims/pending/)", status == 200, status, lat, f"Pending count: {len(pending_claims)}")

    # ------------------------------------------------------------------
    # 7. Custody & Inventory (Security Role)
    # ------------------------------------------------------------------
    status, body, lat, headers = make_request("GET", f"{API_BASE}/custody/inventory/", token=security_token)
    inv_data = body.get("data", []) if isinstance(body, dict) else []
    inventory = inv_data if isinstance(inv_data, list) else inv_data.get("items", [])
    log_test("Custody", "Security Custody Inventory (/custody/inventory/)", status == 200, status, lat, f"Custody items: {len(inventory)}")

    status, body, lat, headers = make_request("GET", f"{API_BASE}/custody/locations/", token=security_token)
    log_test("Custody", "Custody Security Locations (/custody/locations/)", status == 200, status, lat)

    # ------------------------------------------------------------------
    # 8. Handovers & Recovery
    # ------------------------------------------------------------------
    status, body, lat, headers = make_request("GET", f"{API_BASE}/handovers/pending/", token=security_token)
    log_test("Handovers", "Pending Handovers Queue (/handovers/pending/)", status == 200, status, lat)

    status, body, lat, headers = make_request("GET", f"{API_BASE}/handovers/direct-reports/", token=security_token)
    log_test("Handovers", "Eligible Direct Recovery Reports (/handovers/direct-reports/)", status == 200, status, lat)

    status, body, lat, headers = make_request("GET", f"{API_BASE}/handovers/my-recovery-history/", token=student_token)
    log_test("Handovers", "User Recovery History (/handovers/my-recovery-history/)", status == 200, status, lat)

    # ------------------------------------------------------------------
    # 9. Admin Portal Workflows
    # ------------------------------------------------------------------
    status, body, lat, headers = make_request("GET", f"{API_BASE}/admin/analytics/", token=admin_token)
    data_obj = body.get("data", {}) if isinstance(body, dict) else {}
    overview = data_obj.get("overview", {}) if isinstance(data_obj, dict) else {}
    total_reports = overview.get("totalReports", data_obj.get("totalReports"))
    passed = status == 200 and total_reports is not None
    log_test("Admin Portal", "Admin Analytics Dashboard (/admin/analytics/)", passed, status, lat, f"Total Reports Metric: {total_reports}")

    status, body, lat, headers = make_request("GET", f"{API_BASE}/admin/users/", token=admin_token)
    u_data = body.get("data", []) if isinstance(body, dict) else []
    users_list = u_data if isinstance(u_data, list) else u_data.get("users", [])
    log_test("Admin Portal", "Admin User Governance (/admin/users/)", status == 200, status, lat, f"Users loaded: {len(users_list)}")

    status, body, lat, headers = make_request("GET", f"{API_BASE}/admin/audit-logs/?limit=10", token=admin_token)
    a_data = body.get("data", {}) if isinstance(body, dict) else {}
    audit_logs = a_data.get("items", []) if isinstance(a_data, dict) else (a_data if isinstance(a_data, list) else [])
    total_audit = a_data.get("total", len(audit_logs)) if isinstance(a_data, dict) else len(audit_logs)
    passed = status == 200 and len(audit_logs) > 0
    log_test("Admin Portal", "Forensic Audit Trail (/admin/audit-logs/)", passed, status, lat, f"Audit entries: {len(audit_logs)} (Total in DB: {total_audit})")

    status, body, lat, headers = make_request("GET", f"{API_BASE}/admin/inventory/", token=admin_token)
    log_test("Admin Portal", "Admin Master Inventory (/admin/inventory/)", status == 200, status, lat)

    status, body, lat, headers = make_request("GET", f"{API_BASE}/admin/retention/queue/", token=admin_token)
    log_test("Admin Portal", "Retention & Ageing Queue (/admin/retention/queue/)", status == 200, status, lat)

    # ------------------------------------------------------------------
    # 10. Security Checks & Hardening Verification
    # ------------------------------------------------------------------
    # Response headers check
    hsts = headers.get("Strict-Transport-Security") or headers.get("strict-transport-security")
    xcto = headers.get("X-Content-Type-Options") or headers.get("x-content-type-options")
    xfo = headers.get("X-Frame-Options") or headers.get("x-frame-options")
    log_test("Security Headers", "Strict-Transport-Security Header Present", bool(hsts), 200, 0, f"HSTS: {hsts}")
    log_test("Security Headers", "X-Content-Type-Options (nosniff) Present", bool(xcto), 200, 0, f"X-Content-Type-Options: {xcto}")

    # Injection resistance test (NoSQL injection probe)
    nosql_probe = urllib.parse.quote('{"$gt": ""}')
    status, body, lat, headers = make_request("GET", f"{API_BASE}/items/?search={nosql_probe}", token=student_token)
    # The application should safely treat this as a string search without database syntax errors
    log_test("Security Audit", "NoSQL Injection payload handling on search", status == 200, status, lat)

    # SQL/NoSQL quote probe
    quote_probe = urllib.parse.quote("' OR '1'='1")
    status, body, lat, headers = make_request("GET", f"{API_BASE}/items/?search={quote_probe}", token=student_token)
    log_test("Security Audit", "SQL Injection quote probe on search", status == 200, status, lat)

    # ------------------------------------------------------------------
    # 11. Frontend Vercel Pages Availability
    # ------------------------------------------------------------------
    frontend_pages = [
        ("/", "Landing Homepage"),
        ("/login", "Login Page"),
        ("/register", "Registration Page"),
        ("/board", "Public Items Board"),
        ("/report", "Property Reporting Page"),
        ("/dashboard", "User Dashboard"),
        ("/security", "Security Dashboard"),
        ("/admin", "Admin Dashboard"),
    ]
    for path, desc in frontend_pages:
        status, body, lat, headers = make_request("GET", f"{FRONTEND_URL}{path}")
        passed = status in (200, 307, 308)  # 200 or clean client-side auth redirect
        log_test("Frontend (Vercel)", f"{desc} ({path})", passed, status, lat)

    # ------------------------------------------------------------------
    # Summary & Metrics Calculation
    # ------------------------------------------------------------------
    print(f"\n=======================================================")
    print(f"PRODUCTION TEST RUN COMPLETE")
    print(f"Total Tests:  {results['summary']['total']}")
    print(f"Passed:       {results['summary']['passed']}")
    print(f"Failed:       {results['summary']['failed']}")
    if results["latencies"]:
        sorted_lats = sorted(results["latencies"])
        p50 = sorted_lats[int(len(sorted_lats) * 0.50)]
        p95 = sorted_lats[int(len(sorted_lats) * 0.95)]
        max_lat = max(sorted_lats)
        print(f"Latency P50:  {p50:.1f}ms")
        print(f"Latency P95:  {p95:.1f}ms")
        print(f"Latency Max:  {max_lat:.1f}ms")
    print(f"=======================================================\n")

    with open("production_e2e_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("Results written to production_e2e_results.json")

if __name__ == "__main__":
    run_all_tests()
