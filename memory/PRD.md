# FinLedger - Enterprise Finance Dashboard

## Original Problem Statement
Role-aware finance management dashboard with RBAC, financial transaction management, analytics, and data visualization. Full-stack: FastAPI + MongoDB + React.

## Architecture
- **Backend**: FastAPI (Python) with MongoDB via Motor (async driver)
- **Frontend**: React 18 (JavaScript) with Tailwind CSS, shadcn/ui, Recharts, Framer Motion
- **Auth**: JWT (PyJWT) + bcrypt password hashing
- **Database**: MongoDB (collections: users, categories, transactions, audit_logs, budget_goals, recurring_templates)
- **State Management**: React Context (auth) + TanStack Query (server state)

## User Personas
1. **Admin** - Full CRUD on transactions/categories/users/budgets/templates, all analytics
2. **Analyst** - Read transactions + insights/analytics access
3. **Viewer** - Read-only: dashboard + transactions list

## Core Requirements (Static)
- JWT auth with RBAC, Dashboard analytics, Transaction CRUD, Insights, User Management
- Dark/light mode, CSV/JSON export, Audit logging

## What's Been Implemented

### Iteration 1 (2026-04-05)
- [x] Complete backend API with all endpoints
- [x] JWT authentication + RBAC
- [x] Seed data: 3 demo users, 12 categories, 125+ transactions
- [x] Dashboard: summary cards, trend chart, donut chart, recent transactions, insights
- [x] Transactions: data table, search, filters, pagination, CRUD modal, CSV/JSON export
- [x] Insights: spending heatmap, monthly comparison, anomaly detection, top categories/tags
- [x] Users: user table, role management, invite dialog
- [x] Login: email/password form, quick demo buttons, hero image
- [x] AppShell: sidebar navigation, topbar, dark/light mode

### Iteration 2 (2026-04-05)
- [x] Date Range Picker (Dashboard + Transactions) using Calendar + Popover
- [x] Framer Motion page transitions on all pages
- [x] Category CRUD management page (admin)
- [x] Budget Goal tracking (backend + API)
- [x] Recurring Transaction Templates (backend + UI dropdown to apply)
- [x] Financial Health Score widget on dashboard (composite score: savings rate, spending consistency, budget adherence, income stability)
- [x] Dark mode improved (sidebar toggle + dropdown menu toggle, persisted to localStorage)
- [x] Mobile responsive sidebar overlay

## Test Credentials
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@demo.com | Demo@1234 |
| Analyst | analyst@demo.com | Demo@1234 |
| Viewer | viewer@demo.com | Demo@1234 |

## Prioritized Backlog
### P1
- Budget goals UI page for creating/managing goals
- Recurring templates UI management page

### P2
- Multi-currency support
- WebSocket real-time updates
- Full-text search with MongoDB text index
- Report PDF export
