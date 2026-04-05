from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt
import random
import math
from datetime import datetime, timezone, timedelta, date
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from bson import ObjectId

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT config
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# App setup
app = FastAPI(title="FinLedger API", version="1.0.0")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================
# PASSWORD UTILITIES
# ============================================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

# ============================================================
# JWT UTILITIES
# ============================================================
def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# ============================================================
# AUTH DEPENDENCIES
# ============================================================
async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account disabled")
        return {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "is_active": user["is_active"]
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_role(*roles):
    async def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return role_checker

# ============================================================
# PYDANTIC SCHEMAS
# ============================================================
class LoginRequest(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: str = "viewer"

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class TransactionCreate(BaseModel):
    amount: float
    type: str
    category_id: str
    description: str = ""
    date: str
    tags: List[str] = []
    notes: str = ""

class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    type: Optional[str] = None
    category_id: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None

class CategoryCreate(BaseModel):
    name: str
    type: str
    color_hex: str = "#6366f1"
    icon: str = ""

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    color_hex: Optional[str] = None
    icon: Optional[str] = None

class BudgetGoalCreate(BaseModel):
    category_id: Optional[str] = None
    name: str
    target_cents: int
    period: str = "monthly"  # monthly, weekly

class BudgetGoalUpdate(BaseModel):
    name: Optional[str] = None
    target_cents: Optional[int] = None
    period: Optional[str] = None
    is_active: Optional[bool] = None

class RecurringTemplateCreate(BaseModel):
    amount: float
    type: str
    category_id: str
    description: str = ""
    frequency: str = "monthly"  # daily, weekly, monthly, yearly
    tags: List[str] = []
    notes: str = ""

class RecurringTemplateUpdate(BaseModel):
    amount: Optional[float] = None
    type: Optional[str] = None
    category_id: Optional[str] = None
    description: Optional[str] = None
    frequency: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

# ============================================================
# AUDIT LOGGING
# ============================================================
async def log_audit(user_id: str, action: str, entity: str, entity_id: str = None, payload: dict = None, ip: str = None):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "payload": payload,
        "ip_address": ip,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

# ============================================================
# AUTH ROUTES
# ============================================================
@api_router.post("/v1/auth/login")
async def login(req: LoginRequest, request: Request):
    email = req.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token(user["id"], user["role"])
    refresh_token = create_refresh_token(user["id"])
    
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}})
    await log_audit(user["id"], "auth.login", "user", user["id"], ip=request.client.host if request.client else None)
    
    from starlette.responses import JSONResponse
    response = JSONResponse({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "is_active": user["is_active"]
        }
    })
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return response

@api_router.post("/v1/auth/refresh")
async def refresh_token(request: Request):
    token = request.cookies.get("refresh_token")
    if not token:
        body = await request.json()
        token = body.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        new_access = create_access_token(user["id"], user["role"])
        from starlette.responses import JSONResponse
        response = JSONResponse({"access_token": new_access, "token_type": "bearer", "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60})
        response.set_cookie(key="access_token", value=new_access, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
        return response
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@api_router.post("/v1/auth/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    from starlette.responses import JSONResponse
    response = JSONResponse({"message": "Logged out"})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return response

@api_router.get("/v1/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"success": True, "data": current_user}

# ============================================================
# CATEGORY ROUTES
# ============================================================
@api_router.get("/v1/categories")
async def get_categories(current_user: dict = Depends(get_current_user)):
    cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    return {"success": True, "data": cats}

@api_router.post("/v1/categories")
async def create_category(cat: CategoryCreate, request: Request, current_user: dict = Depends(require_role("admin"))):
    doc = {
        "id": str(uuid.uuid4()),
        "name": cat.name,
        "type": cat.type,
        "color_hex": cat.color_hex,
        "icon": cat.icon,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    await log_audit(current_user["id"], "category.create", "category", doc["id"], ip=request.client.host if request.client else None)
    return {"success": True, "data": doc}

@api_router.patch("/v1/categories/{category_id}")
async def update_category(category_id: str, cat: CategoryUpdate, request: Request, current_user: dict = Depends(require_role("admin"))):
    updates = {k: v for k, v in cat.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.categories.update_one({"id": category_id}, {"$set": updates})
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"success": True, "data": updated}

# ============================================================
# TRANSACTION ROUTES
# ============================================================
@api_router.get("/v1/transactions")
async def get_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    type: Optional[str] = None,
    category_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    tags: Optional[str] = None,
    sort_by: str = "date",
    sort_order: str = "desc",
    current_user: dict = Depends(get_current_user)
):
    query = {"is_deleted": {"$ne": True}}
    if type:
        query["type"] = type
    if category_id:
        query["category_id"] = category_id
    if date_from:
        query["date"] = query.get("date", {})
        query["date"]["$gte"] = date_from
    if date_to:
        if "date" not in query:
            query["date"] = {}
        query["date"]["$lte"] = date_to
    if search:
        query["$or"] = [
            {"description": {"$regex": search, "$options": "i"}},
            {"notes": {"$regex": search, "$options": "i"}}
        ]
    if tags:
        tag_list = [t.strip() for t in tags.split(",")]
        query["tags"] = {"$in": tag_list}
    
    sort_field = sort_by if sort_by in ["date", "amount_cents", "category_id"] else "date"
    if sort_field == "amount":
        sort_field = "amount_cents"
    sort_dir = -1 if sort_order == "desc" else 1
    
    total = await db.transactions.count_documents(query)
    skip = (page - 1) * page_size
    
    txns = await db.transactions.find(query, {"_id": 0}).sort(sort_field, sort_dir).skip(skip).limit(page_size).to_list(page_size)
    
    # Enrich with category info
    cat_ids = list(set(t.get("category_id") for t in txns if t.get("category_id")))
    cats = {}
    if cat_ids:
        for c in await db.categories.find({"id": {"$in": cat_ids}}, {"_id": 0}).to_list(100):
            cats[c["id"]] = c
    
    user_ids = list(set(t.get("created_by") for t in txns if t.get("created_by")))
    users = {}
    if user_ids:
        for u in await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "password_hash": 0}).to_list(100):
            users[u["id"]] = u
    
    items = []
    for t in txns:
        cat = cats.get(t.get("category_id"), {})
        creator = users.get(t.get("created_by"), {})
        items.append({
            "id": t["id"],
            "amount_cents": t["amount_cents"],
            "amount_display": f"{t['amount_cents'] / 100:.2f}",
            "type": t["type"],
            "category": {"id": cat.get("id", ""), "name": cat.get("name", ""), "color_hex": cat.get("color_hex", ""), "icon": cat.get("icon", "")},
            "description": t.get("description", ""),
            "date": t["date"],
            "tags": t.get("tags", []),
            "notes": t.get("notes", ""),
            "created_at": t.get("created_at", ""),
            "created_by": {"id": creator.get("id", ""), "full_name": creator.get("full_name", "")}
        })
    
    total_pages = max(1, math.ceil(total / page_size))
    return {
        "success": True,
        "data": {
            "items": items,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        }
    }

@api_router.post("/v1/transactions")
async def create_transaction(txn: TransactionCreate, request: Request, current_user: dict = Depends(require_role("admin"))):
    if txn.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    cat = await db.categories.find_one({"id": txn.category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=400, detail="Category not found")
    
    amount_cents = int(round(txn.amount * 100))
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "amount_cents": amount_cents,
        "type": txn.type,
        "category_id": txn.category_id,
        "description": txn.description,
        "date": txn.date,
        "tags": txn.tags,
        "notes": txn.notes,
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
        "updated_by": current_user["id"]
    }
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    
    await log_audit(current_user["id"], "transaction.create", "transaction", doc["id"], payload={"amount_cents": amount_cents, "type": txn.type}, ip=request.client.host if request.client else None)
    
    return {"success": True, "data": doc}

@api_router.patch("/v1/transactions/{txn_id}")
async def update_transaction(txn_id: str, txn: TransactionUpdate, request: Request, current_user: dict = Depends(require_role("admin"))):
    updates = {}
    raw = txn.model_dump()
    for k, v in raw.items():
        if v is not None:
            if k == "amount":
                updates["amount_cents"] = int(round(v * 100))
            else:
                updates[k] = v
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = current_user["id"]
    
    result = await db.transactions.update_one({"id": txn_id, "is_deleted": {"$ne": True}}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    updated = await db.transactions.find_one({"id": txn_id}, {"_id": 0})
    await log_audit(current_user["id"], "transaction.update", "transaction", txn_id, payload=updates, ip=request.client.host if request.client else None)
    return {"success": True, "data": updated}

@api_router.delete("/v1/transactions/{txn_id}")
async def delete_transaction(txn_id: str, request: Request, current_user: dict = Depends(require_role("admin"))):
    result = await db.transactions.update_one(
        {"id": txn_id, "is_deleted": {"$ne": True}},
        {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": current_user["id"]}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await log_audit(current_user["id"], "transaction.delete", "transaction", txn_id, ip=request.client.host if request.client else None)
    return {"success": True, "message": "Transaction deleted"}

# ============================================================
# DASHBOARD ROUTES
# ============================================================
@api_router.get("/v1/dashboard/summary")
async def dashboard_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    if not date_from:
        date_from = now.replace(day=1).strftime("%Y-%m-%d")
    if not date_to:
        date_to = now.strftime("%Y-%m-%d")
    
    query = {"is_deleted": {"$ne": True}, "date": {"$gte": date_from, "$lte": date_to}}
    txns = await db.transactions.find(query, {"_id": 0}).to_list(10000)
    
    total_income = sum(t["amount_cents"] for t in txns if t["type"] == "income")
    total_expenses = sum(t["amount_cents"] for t in txns if t["type"] == "expense")
    net = total_income - total_expenses
    income_count = sum(1 for t in txns if t["type"] == "income")
    expense_count = sum(1 for t in txns if t["type"] == "expense")
    
    largest_expense = None
    expense_txns = [t for t in txns if t["type"] == "expense"]
    if expense_txns:
        le = max(expense_txns, key=lambda x: x["amount_cents"])
        largest_expense = {"amount_cents": le["amount_cents"], "description": le.get("description", ""), "date": le["date"]}
    
    savings_rate = round((net / total_income * 100), 1) if total_income > 0 else 0
    
    return {
        "success": True,
        "data": {
            "period": {"from": date_from, "to": date_to},
            "total_income_cents": total_income,
            "total_expenses_cents": total_expenses,
            "net_balance_cents": net,
            "total_transactions": len(txns),
            "income_count": income_count,
            "expense_count": expense_count,
            "largest_expense": largest_expense,
            "savings_rate_percent": savings_rate
        }
    }

@api_router.get("/v1/dashboard/category-breakdown")
async def category_breakdown(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    if not date_from:
        date_from = now.replace(day=1).strftime("%Y-%m-%d")
    if not date_to:
        date_to = now.strftime("%Y-%m-%d")
    
    query = {"is_deleted": {"$ne": True}, "date": {"$gte": date_from, "$lte": date_to}}
    pipeline = [
        {"$match": query},
        {"$group": {"_id": {"category_id": "$category_id", "type": "$type"}, "total": {"$sum": "$amount_cents"}, "count": {"$sum": 1}}}
    ]
    results = await db.transactions.aggregate(pipeline).to_list(100)
    
    cats_map = {}
    cat_ids = list(set(r["_id"]["category_id"] for r in results))
    if cat_ids:
        for c in await db.categories.find({"id": {"$in": cat_ids}}, {"_id": 0}).to_list(100):
            cats_map[c["id"]] = c
    
    income_items = []
    expense_items = []
    total_income = sum(r["total"] for r in results if r["_id"]["type"] == "income")
    total_expense = sum(r["total"] for r in results if r["_id"]["type"] == "expense")
    
    for r in results:
        cat = cats_map.get(r["_id"]["category_id"], {})
        item = {
            "category": cat.get("name", "Unknown"),
            "category_id": r["_id"]["category_id"],
            "color_hex": cat.get("color_hex", "#6366f1"),
            "total_cents": r["total"],
            "count": r["count"],
            "percentage": round(r["total"] / (total_income if r["_id"]["type"] == "income" else total_expense) * 100, 1) if (total_income if r["_id"]["type"] == "income" else total_expense) > 0 else 0
        }
        if r["_id"]["type"] == "income":
            income_items.append(item)
        else:
            expense_items.append(item)
    
    income_items.sort(key=lambda x: x["total_cents"], reverse=True)
    expense_items.sort(key=lambda x: x["total_cents"], reverse=True)
    
    return {"success": True, "data": {"income": income_items, "expense": expense_items}}

@api_router.get("/v1/dashboard/trend")
async def dashboard_trend(
    granularity: str = "monthly",
    months_back: int = 6,
    current_user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=months_back * 30)).strftime("%Y-%m-%d")
    end = now.strftime("%Y-%m-%d")
    
    query = {"is_deleted": {"$ne": True}, "date": {"$gte": start, "$lte": end}}
    txns = await db.transactions.find(query, {"_id": 0}).to_list(10000)
    
    if granularity == "monthly":
        buckets = {}
        for i in range(months_back):
            d = now - timedelta(days=i * 30)
            key = d.strftime("%Y-%m")
            buckets[key] = {"income": 0, "expense": 0}
        for t in txns:
            key = t["date"][:7]
            if key in buckets:
                buckets[key][t["type"]] += t["amount_cents"]
        
        sorted_keys = sorted(buckets.keys())
        month_names = []
        for k in sorted_keys:
            d = datetime.strptime(k, "%Y-%m")
            month_names.append(d.strftime("%b"))
        
        return {
            "success": True,
            "data": {
                "labels": month_names,
                "income": [buckets[k]["income"] for k in sorted_keys],
                "expense": [buckets[k]["expense"] for k in sorted_keys],
                "net": [buckets[k]["income"] - buckets[k]["expense"] for k in sorted_keys]
            }
        }
    elif granularity == "daily":
        buckets = {}
        for i in range(30):
            d = now - timedelta(days=i)
            key = d.strftime("%Y-%m-%d")
            buckets[key] = {"income": 0, "expense": 0}
        for t in txns:
            key = t["date"]
            if key in buckets:
                buckets[key][t["type"]] += t["amount_cents"]
        sorted_keys = sorted(buckets.keys())
        labels = [k[5:] for k in sorted_keys]
        return {
            "success": True,
            "data": {
                "labels": labels,
                "income": [buckets[k]["income"] for k in sorted_keys],
                "expense": [buckets[k]["expense"] for k in sorted_keys],
                "net": [buckets[k]["income"] - buckets[k]["expense"] for k in sorted_keys]
            }
        }
    else:
        # weekly
        buckets = {}
        for i in range(12):
            d = now - timedelta(weeks=i)
            key = d.strftime("%Y-W%W")
            buckets[key] = {"income": 0, "expense": 0}
        for t in txns:
            td = datetime.strptime(t["date"], "%Y-%m-%d")
            key = td.strftime("%Y-W%W")
            if key in buckets:
                buckets[key][t["type"]] += t["amount_cents"]
        sorted_keys = sorted(buckets.keys())
        return {
            "success": True,
            "data": {
                "labels": [k.split("-")[1] for k in sorted_keys],
                "income": [buckets[k]["income"] for k in sorted_keys],
                "expense": [buckets[k]["expense"] for k in sorted_keys],
                "net": [buckets[k]["income"] - buckets[k]["expense"] for k in sorted_keys]
            }
        }

@api_router.get("/v1/dashboard/recent")
async def dashboard_recent(current_user: dict = Depends(get_current_user)):
    txns = await db.transactions.find({"is_deleted": {"$ne": True}}, {"_id": 0}).sort("date", -1).limit(5).to_list(5)
    
    cat_ids = list(set(t.get("category_id") for t in txns if t.get("category_id")))
    cats = {}
    if cat_ids:
        for c in await db.categories.find({"id": {"$in": cat_ids}}, {"_id": 0}).to_list(100):
            cats[c["id"]] = c
    
    items = []
    for t in txns:
        cat = cats.get(t.get("category_id"), {})
        items.append({
            "id": t["id"],
            "amount_cents": t["amount_cents"],
            "amount_display": f"{t['amount_cents'] / 100:.2f}",
            "type": t["type"],
            "category": {"id": cat.get("id", ""), "name": cat.get("name", ""), "color_hex": cat.get("color_hex", ""), "icon": cat.get("icon", "")},
            "description": t.get("description", ""),
            "date": t["date"]
        })
    
    return {"success": True, "data": items}

@api_router.get("/v1/dashboard/insights")
async def dashboard_insights(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(require_role("analyst", "admin"))
):
    now = datetime.now(timezone.utc)
    if not date_from:
        date_from = now.replace(day=1).strftime("%Y-%m-%d")
    if not date_to:
        date_to = now.strftime("%Y-%m-%d")
    
    query = {"is_deleted": {"$ne": True}, "date": {"$gte": date_from, "$lte": date_to}}
    txns = await db.transactions.find(query, {"_id": 0}).to_list(10000)
    
    expenses = [t for t in txns if t["type"] == "expense"]
    
    # Highest spending category
    cat_totals = {}
    for t in expenses:
        cid = t.get("category_id", "")
        cat_totals[cid] = cat_totals.get(cid, 0) + t["amount_cents"]
    
    highest_cat = None
    if cat_totals:
        max_cid = max(cat_totals, key=cat_totals.get)
        cat_doc = await db.categories.find_one({"id": max_cid}, {"_id": 0})
        highest_cat = {"name": cat_doc["name"] if cat_doc else "Unknown", "total_cents": cat_totals[max_cid]}
    
    # Month over month change
    prev_start = (datetime.strptime(date_from, "%Y-%m-%d") - timedelta(days=30)).strftime("%Y-%m-%d")
    prev_end = (datetime.strptime(date_from, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    prev_query = {"is_deleted": {"$ne": True}, "date": {"$gte": prev_start, "$lte": prev_end}, "type": "expense"}
    prev_txns = await db.transactions.find(prev_query, {"_id": 0}).to_list(10000)
    prev_total = sum(t["amount_cents"] for t in prev_txns)
    curr_total = sum(t["amount_cents"] for t in expenses)
    mom_change = round(((curr_total - prev_total) / prev_total * 100), 1) if prev_total > 0 else 0
    
    # Average daily spend
    days_in_period = max(1, (datetime.strptime(date_to, "%Y-%m-%d") - datetime.strptime(date_from, "%Y-%m-%d")).days + 1)
    avg_daily = int(curr_total / days_in_period)
    
    # Top tags
    tag_counts = {}
    for t in txns:
        for tag in t.get("tags", []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    top_tags = sorted(tag_counts.keys(), key=lambda x: tag_counts[x], reverse=True)[:5]
    
    # Unusual transactions (z-score > 2)
    unusual = []
    for cid, total in cat_totals.items():
        cat_expenses = [t for t in expenses if t.get("category_id") == cid]
        if len(cat_expenses) < 3:
            continue
        amounts = [t["amount_cents"] for t in cat_expenses]
        mean = sum(amounts) / len(amounts)
        variance = sum((a - mean) ** 2 for a in amounts) / len(amounts)
        std = math.sqrt(variance) if variance > 0 else 0
        if std == 0:
            continue
        for t in cat_expenses:
            zscore = abs((t["amount_cents"] - mean) / std)
            if zscore > 2.0:
                unusual.append({
                    "id": t["id"],
                    "amount_cents": t["amount_cents"],
                    "zscore": round(zscore, 1),
                    "description": t.get("description", "")
                })
    
    # Projected monthly expense
    projected = int(avg_daily * 30) if avg_daily > 0 else 0
    
    # Daily spend data for heatmap (last 90 days)
    heatmap_start = (now - timedelta(days=90)).strftime("%Y-%m-%d")
    heatmap_query = {"is_deleted": {"$ne": True}, "date": {"$gte": heatmap_start, "$lte": date_to}, "type": "expense"}
    heatmap_txns = await db.transactions.find(heatmap_query, {"_id": 0}).to_list(10000)
    daily_spend = {}
    for t in heatmap_txns:
        d = t["date"]
        daily_spend[d] = daily_spend.get(d, 0) + t["amount_cents"]
    heatmap_data = [{"date": k, "amount_cents": v} for k, v in sorted(daily_spend.items())]
    
    # Monthly comparison (current vs previous month per category)
    cats_map = {}
    all_cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    for c in all_cats:
        cats_map[c["id"]] = c["name"]
    
    curr_by_cat = {}
    prev_by_cat = {}
    for t in expenses:
        cname = cats_map.get(t.get("category_id"), "Other")
        curr_by_cat[cname] = curr_by_cat.get(cname, 0) + t["amount_cents"]
    for t in prev_txns:
        cname = cats_map.get(t.get("category_id"), "Other")
        prev_by_cat[cname] = prev_by_cat.get(cname, 0) + t["amount_cents"]
    
    all_cat_names = sorted(set(list(curr_by_cat.keys()) + list(prev_by_cat.keys())))
    monthly_comparison = [
        {"category": cn, "current": curr_by_cat.get(cn, 0), "previous": prev_by_cat.get(cn, 0)}
        for cn in all_cat_names
    ]
    
    return {
        "success": True,
        "data": {
            "highest_spending_category": highest_cat,
            "month_over_month_change_percent": mom_change,
            "avg_daily_spend_cents": avg_daily,
            "top_tags": top_tags,
            "unusual_transactions": unusual[:10],
            "projected_monthly_expense_cents": projected,
            "heatmap_data": heatmap_data,
            "monthly_comparison": monthly_comparison
        }
    }

# ============================================================
# USER ROUTES (admin only)
# ============================================================
@api_router.get("/v1/users")
async def get_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(require_role("admin"))
):
    query = {}
    if role:
        query["role"] = role
    if status == "active":
        query["is_active"] = True
    elif status == "inactive":
        query["is_active"] = False
    
    total = await db.users.count_documents(query)
    skip = (page - 1) * page_size
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    total_pages = max(1, math.ceil(total / page_size))
    
    return {
        "success": True,
        "data": {
            "items": users,
            "pagination": {"page": page, "page_size": page_size, "total_items": total, "total_pages": total_pages, "has_next": page < total_pages, "has_prev": page > 1}
        }
    }

@api_router.post("/v1/users")
async def create_user(user: UserCreate, request: Request, current_user: dict = Depends(require_role("admin"))):
    existing = await db.users.find_one({"email": user.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    doc = {
        "id": str(uuid.uuid4()),
        "email": user.email.lower(),
        "password_hash": hash_password(user.password),
        "full_name": user.full_name,
        "role": user.role if user.role in ["viewer", "analyst", "admin"] else "viewer",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    await log_audit(current_user["id"], "user.create", "user", doc["id"], ip=request.client.host if request.client else None)
    return {"success": True, "data": doc}

@api_router.get("/v1/users/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(require_role("admin"))):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "data": user}

@api_router.patch("/v1/users/{user_id}")
async def update_user(user_id: str, user: UserUpdate, request: Request, current_user: dict = Depends(require_role("admin"))):
    updates = {k: v for k, v in user.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "role" in updates and updates["role"] not in ["viewer", "analyst", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.users.update_one({"id": user_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    await log_audit(current_user["id"], "user.update", "user", user_id, payload=updates, ip=request.client.host if request.client else None)
    return {"success": True, "data": updated}

@api_router.delete("/v1/users/{user_id}")
async def deactivate_user(user_id: str, request: Request, current_user: dict = Depends(require_role("admin"))):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    result = await db.users.update_one({"id": user_id}, {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await log_audit(current_user["id"], "user.deactivate", "user", user_id, ip=request.client.host if request.client else None)
    return {"success": True, "message": "User deactivated"}

# ============================================================
# AUDIT LOG ROUTES (admin only)
# ============================================================
@api_router.get("/v1/audit-logs")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(require_role("admin"))
):
    total = await db.audit_logs.count_documents({})
    skip = (page - 1) * page_size
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    total_pages = max(1, math.ceil(total / page_size))
    return {
        "success": True,
        "data": {
            "items": logs,
            "pagination": {"page": page, "page_size": page_size, "total_items": total, "total_pages": total_pages}
        }
    }

# ============================================================
# SEED DATA
# ============================================================
SEED_CATEGORIES = [
    {"name": "Salary", "type": "income", "color_hex": "#22c55e", "icon": "briefcase"},
    {"name": "Freelance", "type": "income", "color_hex": "#10b981", "icon": "laptop"},
    {"name": "Investment", "type": "income", "color_hex": "#14b8a6", "icon": "trending-up"},
    {"name": "Rent", "type": "expense", "color_hex": "#ef4444", "icon": "home"},
    {"name": "Food", "type": "expense", "color_hex": "#f97316", "icon": "utensils"},
    {"name": "Transport", "type": "expense", "color_hex": "#eab308", "icon": "car"},
    {"name": "Healthcare", "type": "expense", "color_hex": "#ec4899", "icon": "heart-pulse"},
    {"name": "Entertainment", "type": "expense", "color_hex": "#8b5cf6", "icon": "gamepad-2"},
    {"name": "Utilities", "type": "expense", "color_hex": "#6366f1", "icon": "zap"},
    {"name": "Education", "type": "expense", "color_hex": "#3b82f6", "icon": "graduation-cap"},
    {"name": "Shopping", "type": "expense", "color_hex": "#d946ef", "icon": "shopping-bag"},
    {"name": "Other", "type": "expense", "color_hex": "#64748b", "icon": "circle-dot"},
]

async def seed_data():
    # Seed users
    users_to_seed = [
        {"email": os.environ.get("ADMIN_EMAIL", "admin@demo.com"), "full_name": "Admin User", "role": "admin", "password": os.environ.get("ADMIN_PASSWORD", "Demo@1234")},
        {"email": os.environ.get("ANALYST_EMAIL", "analyst@demo.com"), "full_name": "Analyst User", "role": "analyst", "password": os.environ.get("ANALYST_PASSWORD", "Demo@1234")},
        {"email": os.environ.get("VIEWER_EMAIL", "viewer@demo.com"), "full_name": "Viewer User", "role": "viewer", "password": os.environ.get("VIEWER_PASSWORD", "Demo@1234")},
    ]
    
    user_ids = []
    for u in users_to_seed:
        existing = await db.users.find_one({"email": u["email"]})
        if not existing:
            uid = str(uuid.uuid4())
            await db.users.insert_one({
                "id": uid,
                "email": u["email"],
                "password_hash": hash_password(u["password"]),
                "full_name": u["full_name"],
                "role": u["role"],
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
            user_ids.append(uid)
            logger.info(f"Seeded user: {u['email']} ({u['role']})")
        else:
            user_ids.append(existing.get("id", str(uuid.uuid4())))
            # Update password if changed
            if not verify_password(u["password"], existing["password_hash"]):
                await db.users.update_one({"email": u["email"]}, {"$set": {"password_hash": hash_password(u["password"])}})
    
    # Seed categories
    for cat in SEED_CATEGORIES:
        existing = await db.categories.find_one({"name": cat["name"]})
        if not existing:
            await db.categories.insert_one({
                "id": str(uuid.uuid4()),
                "name": cat["name"],
                "type": cat["type"],
                "color_hex": cat["color_hex"],
                "icon": cat["icon"],
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # Seed transactions if none exist
    txn_count = await db.transactions.count_documents({})
    if txn_count == 0:
        cats = await db.categories.find({}, {"_id": 0}).to_list(100)
        income_cats = [c for c in cats if c["type"] == "income"]
        expense_cats = [c for c in cats if c["type"] == "expense"]
        admin_id = user_ids[0] if user_ids else "admin"
        
        now = datetime.now(timezone.utc)
        tags_pool = ["recurring", "business", "personal", "one-time", "subscription", "essential", "discretionary"]
        descriptions_income = ["Monthly salary", "Freelance project", "Stock dividends", "Consulting fee", "Bonus payment", "Side gig payment"]
        descriptions_expense = ["Monthly rent", "Groceries", "Gas station", "Doctor visit", "Movie tickets", "Electric bill", "Online course", "Amazon order", "Restaurant dinner", "Uber ride", "Gym membership", "Phone bill", "Internet bill", "Coffee shop", "Books", "Clothing"]
        
        txns = []
        for month_offset in range(6):
            d = now - timedelta(days=month_offset * 30)
            month_start = d.replace(day=1)
            
            # 2-4 income entries per month
            for _ in range(random.randint(2, 4)):
                cat = random.choice(income_cats)
                day = random.randint(1, 28)
                txn_date = month_start.replace(day=day).strftime("%Y-%m-%d")
                amount = random.choice([150000, 200000, 250000, 300000, 50000, 75000, 100000])
                txns.append({
                    "id": str(uuid.uuid4()),
                    "user_id": admin_id,
                    "amount_cents": amount,
                    "type": "income",
                    "category_id": cat["id"],
                    "description": random.choice(descriptions_income),
                    "date": txn_date,
                    "tags": random.sample(tags_pool, random.randint(0, 2)),
                    "notes": "",
                    "is_deleted": False,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "created_by": admin_id,
                    "updated_by": admin_id
                })
            
            # 15-25 expense entries per month
            for _ in range(random.randint(15, 25)):
                cat = random.choice(expense_cats)
                day = random.randint(1, 28)
                txn_date = month_start.replace(day=day).strftime("%Y-%m-%d")
                amount = random.choice([5000, 7500, 10000, 15000, 20000, 25000, 30000, 50000, 75000, 100000, 120000, 150000])
                txns.append({
                    "id": str(uuid.uuid4()),
                    "user_id": admin_id,
                    "amount_cents": amount,
                    "type": "expense",
                    "category_id": cat["id"],
                    "description": random.choice(descriptions_expense),
                    "date": txn_date,
                    "tags": random.sample(tags_pool, random.randint(0, 2)),
                    "notes": "",
                    "is_deleted": False,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "created_by": admin_id,
                    "updated_by": admin_id
                })
        
        if txns:
            await db.transactions.insert_many(txns)
            logger.info(f"Seeded {len(txns)} transactions")
    
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.transactions.create_index("id", unique=True)
    await db.transactions.create_index([("date", -1)])
    await db.transactions.create_index("category_id")
    await db.transactions.create_index("is_deleted")
    await db.categories.create_index("id", unique=True)
    await db.audit_logs.create_index([("created_at", -1)])
    
    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write("| Role | Email | Password |\n")
        f.write("|------|-------|----------|\n")
        f.write(f"| Admin | admin@demo.com | Demo@1234 |\n")
        f.write(f"| Analyst | analyst@demo.com | Demo@1234 |\n")
        f.write(f"| Viewer | viewer@demo.com | Demo@1234 |\n")
        f.write("\n## Auth Endpoints\n")
        f.write("- POST /api/v1/auth/login\n")
        f.write("- POST /api/v1/auth/refresh\n")
        f.write("- POST /api/v1/auth/logout\n")
        f.write("- GET /api/v1/auth/me\n")
    
    logger.info("Seed data complete")

@app.on_event("startup")
async def startup():
    await seed_data()

# ============================================================
# BUDGET GOALS (admin only)
# ============================================================
@api_router.get("/v1/budget-goals")
async def get_budget_goals(current_user: dict = Depends(get_current_user)):
    goals = await db.budget_goals.find({"is_active": True}, {"_id": 0}).to_list(100)
    # Enrich with current spending
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    month_end = now.strftime("%Y-%m-%d")
    
    for goal in goals:
        query = {"is_deleted": {"$ne": True}, "type": "expense", "date": {"$gte": month_start, "$lte": month_end}}
        if goal.get("category_id"):
            query["category_id"] = goal["category_id"]
        spent_agg = await db.transactions.aggregate([
            {"$match": query},
            {"$group": {"_id": None, "total": {"$sum": "$amount_cents"}}}
        ]).to_list(1)
        goal["spent_cents"] = spent_agg[0]["total"] if spent_agg else 0
        goal["progress_percent"] = round((goal["spent_cents"] / goal["target_cents"]) * 100, 1) if goal["target_cents"] > 0 else 0
    
    return {"success": True, "data": goals}

@api_router.post("/v1/budget-goals")
async def create_budget_goal(goal: BudgetGoalCreate, request: Request, current_user: dict = Depends(require_role("admin"))):
    doc = {
        "id": str(uuid.uuid4()),
        "category_id": goal.category_id,
        "name": goal.name,
        "target_cents": goal.target_cents,
        "period": goal.period,
        "is_active": True,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.budget_goals.insert_one(doc)
    doc.pop("_id", None)
    await log_audit(current_user["id"], "budget_goal.create", "budget_goal", doc["id"], ip=request.client.host if request.client else None)
    return {"success": True, "data": doc}

@api_router.patch("/v1/budget-goals/{goal_id}")
async def update_budget_goal(goal_id: str, goal: BudgetGoalUpdate, request: Request, current_user: dict = Depends(require_role("admin"))):
    updates = {k: v for k, v in goal.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.budget_goals.update_one({"id": goal_id}, {"$set": updates})
    updated = await db.budget_goals.find_one({"id": goal_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Budget goal not found")
    return {"success": True, "data": updated}

@api_router.delete("/v1/budget-goals/{goal_id}")
async def delete_budget_goal(goal_id: str, request: Request, current_user: dict = Depends(require_role("admin"))):
    result = await db.budget_goals.update_one({"id": goal_id}, {"$set": {"is_active": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Budget goal not found")
    return {"success": True, "message": "Budget goal removed"}

# ============================================================
# RECURRING TEMPLATES (admin only)
# ============================================================
@api_router.get("/v1/recurring-templates")
async def get_recurring_templates(current_user: dict = Depends(get_current_user)):
    templates = await db.recurring_templates.find({"is_active": True}, {"_id": 0}).to_list(100)
    cat_ids = list(set(t.get("category_id") for t in templates if t.get("category_id")))
    cats = {}
    if cat_ids:
        for c in await db.categories.find({"id": {"$in": cat_ids}}, {"_id": 0}).to_list(100):
            cats[c["id"]] = c
    for t in templates:
        t["category"] = cats.get(t.get("category_id"), {})
    return {"success": True, "data": templates}

@api_router.post("/v1/recurring-templates")
async def create_recurring_template(tmpl: RecurringTemplateCreate, request: Request, current_user: dict = Depends(require_role("admin"))):
    cat = await db.categories.find_one({"id": tmpl.category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=400, detail="Category not found")
    doc = {
        "id": str(uuid.uuid4()),
        "amount_cents": int(round(tmpl.amount * 100)),
        "type": tmpl.type,
        "category_id": tmpl.category_id,
        "description": tmpl.description,
        "frequency": tmpl.frequency,
        "tags": tmpl.tags,
        "notes": tmpl.notes,
        "is_active": True,
        "last_applied": None,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.recurring_templates.insert_one(doc)
    doc.pop("_id", None)
    await log_audit(current_user["id"], "recurring_template.create", "recurring_template", doc["id"], ip=request.client.host if request.client else None)
    return {"success": True, "data": doc}

@api_router.post("/v1/recurring-templates/{template_id}/apply")
async def apply_recurring_template(template_id: str, request: Request, current_user: dict = Depends(require_role("admin"))):
    tmpl = await db.recurring_templates.find_one({"id": template_id, "is_active": True}, {"_id": 0})
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    txn_doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "amount_cents": tmpl["amount_cents"],
        "type": tmpl["type"],
        "category_id": tmpl["category_id"],
        "description": tmpl.get("description", ""),
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "tags": tmpl.get("tags", []) + ["recurring"],
        "notes": tmpl.get("notes", ""),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"],
        "updated_by": current_user["id"]
    }
    await db.transactions.insert_one(txn_doc)
    txn_doc.pop("_id", None)
    await db.recurring_templates.update_one({"id": template_id}, {"$set": {"last_applied": datetime.now(timezone.utc).isoformat()}})
    return {"success": True, "data": txn_doc}

@api_router.delete("/v1/recurring-templates/{template_id}")
async def delete_recurring_template(template_id: str, request: Request, current_user: dict = Depends(require_role("admin"))):
    result = await db.recurring_templates.update_one({"id": template_id}, {"$set": {"is_active": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True, "message": "Template removed"}

# ============================================================
# FINANCIAL HEALTH SCORE
# ============================================================
@api_router.get("/v1/dashboard/health-score")
async def financial_health_score(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    month_end = now.strftime("%Y-%m-%d")
    
    # Current month data
    query = {"is_deleted": {"$ne": True}, "date": {"$gte": month_start, "$lte": month_end}}
    txns = await db.transactions.find(query, {"_id": 0}).to_list(10000)
    income = sum(t["amount_cents"] for t in txns if t["type"] == "income")
    expenses = sum(t["amount_cents"] for t in txns if t["type"] == "expense")
    
    # Previous month data
    prev_start = (now.replace(day=1) - timedelta(days=1)).replace(day=1).strftime("%Y-%m-%d")
    prev_end = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m-%d")
    prev_query = {"is_deleted": {"$ne": True}, "date": {"$gte": prev_start, "$lte": prev_end}}
    prev_txns = await db.transactions.find(prev_query, {"_id": 0}).to_list(10000)
    prev_income = sum(t["amount_cents"] for t in prev_txns if t["type"] == "income")
    prev_expenses = sum(t["amount_cents"] for t in prev_txns if t["type"] == "expense")
    
    # Component scores (each 0-100)
    # 1. Savings rate score
    savings_rate = ((income - expenses) / income * 100) if income > 0 else 0
    savings_score = min(100, max(0, savings_rate * 2.5))  # 40% savings = 100
    
    # 2. Spending consistency score (lower variance = better)
    daily_spends = {}
    for t in txns:
        if t["type"] == "expense":
            daily_spends[t["date"]] = daily_spends.get(t["date"], 0) + t["amount_cents"]
    if len(daily_spends) > 1:
        mean_spend = sum(daily_spends.values()) / len(daily_spends)
        variance = sum((v - mean_spend)**2 for v in daily_spends.values()) / len(daily_spends)
        cv = (math.sqrt(variance) / mean_spend) if mean_spend > 0 else 0
        consistency_score = max(0, min(100, 100 - cv * 50))
    else:
        consistency_score = 50
    
    # 3. Budget adherence score
    goals = await db.budget_goals.find({"is_active": True}, {"_id": 0}).to_list(100)
    if goals:
        adherence_scores = []
        for goal in goals:
            gq = {"is_deleted": {"$ne": True}, "type": "expense", "date": {"$gte": month_start, "$lte": month_end}}
            if goal.get("category_id"):
                gq["category_id"] = goal["category_id"]
            spent_agg = await db.transactions.aggregate([{"$match": gq}, {"$group": {"_id": None, "total": {"$sum": "$amount_cents"}}}]).to_list(1)
            spent = spent_agg[0]["total"] if spent_agg else 0
            ratio = spent / goal["target_cents"] if goal["target_cents"] > 0 else 0
            adherence_scores.append(max(0, min(100, (1 - max(0, ratio - 1)) * 100)))
        budget_score = sum(adherence_scores) / len(adherence_scores)
    else:
        budget_score = 70  # Neutral if no goals set
    
    # 4. Income stability (compared to previous month)
    if prev_income > 0:
        income_change = abs(income - prev_income) / prev_income
        income_score = max(0, min(100, 100 - income_change * 100))
    else:
        income_score = 50
    
    # Weighted composite
    composite = (savings_score * 0.35 + consistency_score * 0.25 + budget_score * 0.25 + income_score * 0.15)
    composite = round(min(100, max(0, composite)), 1)
    
    # Grade
    if composite >= 80: grade = "Excellent"
    elif composite >= 60: grade = "Good"
    elif composite >= 40: grade = "Fair"
    else: grade = "Needs Attention"
    
    return {
        "success": True,
        "data": {
            "score": composite,
            "grade": grade,
            "components": {
                "savings_rate": {"score": round(savings_score, 1), "label": "Savings Rate", "detail": f"{savings_rate:.1f}%"},
                "spending_consistency": {"score": round(consistency_score, 1), "label": "Spending Consistency"},
                "budget_adherence": {"score": round(budget_score, 1), "label": "Budget Adherence"},
                "income_stability": {"score": round(income_score, 1), "label": "Income Stability"}
            },
            "tips": [
                "Set budget goals for your top spending categories" if not goals else "Great job tracking budgets!",
                "Try to maintain consistent daily spending patterns",
                f"Your savings rate is {savings_rate:.1f}% - aim for at least 20%"
            ]
        }
    }

# ============================================================
# HEALTH CHECK
# ============================================================
@api_router.get("/")
async def root():
    return {"message": "FinLedger API v1.0", "status": "healthy"}

@api_router.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/health")
async def app_health():
    return {"status": "ok"}

# Include router & middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
