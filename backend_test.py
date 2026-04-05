#!/usr/bin/env python3
"""
FinLedger Backend API Testing Suite
Tests all backend endpoints with proper authentication and RBAC
"""

import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

class FinLedgerAPITester:
    def __init__(self, base_url="https://finledger-preview.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_base = f"{base_url}/api/v1"
        self.tokens = {}  # Store tokens for different roles
        self.users = {}   # Store user info for different roles
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test credentials from /app/memory/test_credentials.md
        self.credentials = {
            "admin": {"email": "admin@demo.com", "password": "Demo@1234"},
            "analyst": {"email": "analyst@demo.com", "password": "Demo@1234"},
            "viewer": {"email": "viewer@demo.com", "password": "Demo@1234"}
        }

    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "name": name,
            "success": success,
            "details": details,
            "response_data": response_data
        })

    def make_request(self, method: str, endpoint: str, data: dict = None, 
                    token: str = None, expected_status: int = 200) -> tuple[bool, dict]:
        """Make API request with proper error handling"""
        url = f"{self.api_base}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=data)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            else:
                return False, {"error": f"Unsupported method: {method}"}
            
            success = response.status_code == expected_status
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text}
            
            return success, response_data
            
        except Exception as e:
            return False, {"error": str(e)}

    def test_health_check(self):
        """Test basic health endpoints"""
        print("\n🔍 Testing Health Endpoints...")
        
        # Test root endpoint
        success, data = self.make_request('GET', '')
        self.log_test("Root endpoint", success, 
                     "" if success else f"Failed: {data}")
        
        # Test health endpoint
        success, data = self.make_request('GET', 'health')
        self.log_test("Health endpoint", success,
                     "" if success else f"Failed: {data}")

    def test_authentication(self):
        """Test authentication for all roles"""
        print("\n🔍 Testing Authentication...")
        
        for role, creds in self.credentials.items():
            print(f"\n  Testing {role} login...")
            
            # Test login
            success, data = self.make_request('POST', 'auth/login', {
                "email": creds["email"],
                "password": creds["password"]
            })
            
            if success and data.get("access_token"):
                self.tokens[role] = data["access_token"]
                self.users[role] = data.get("user", {})
                self.log_test(f"{role} login", True)
                
                # Test /auth/me endpoint
                me_success, me_data = self.make_request('GET', 'auth/me', 
                                                       token=self.tokens[role])
                self.log_test(f"{role} auth/me", me_success,
                             "" if me_success else f"Failed: {me_data}")
            else:
                self.log_test(f"{role} login", False, f"Failed: {data}")
                
        # Test invalid credentials
        success, data = self.make_request('POST', 'auth/login', {
            "email": "invalid@test.com",
            "password": "wrongpassword"
        }, expected_status=401)
        self.log_test("Invalid credentials rejection", success,
                     "" if success else f"Should have returned 401: {data}")

    def test_categories(self):
        """Test categories endpoints"""
        print("\n🔍 Testing Categories...")
        
        if not self.tokens.get("admin"):
            print("❌ No admin token available for categories testing")
            return
            
        # Test get categories (all roles should access)
        for role in ["admin", "analyst", "viewer"]:
            if role in self.tokens:
                success, data = self.make_request('GET', 'categories', 
                                                 token=self.tokens[role])
                self.log_test(f"{role} get categories", success,
                             "" if success else f"Failed: {data}")

    def test_transactions(self):
        """Test transactions endpoints"""
        print("\n🔍 Testing Transactions...")
        
        if not self.tokens.get("admin"):
            print("❌ No admin token available for transactions testing")
            return
            
        admin_token = self.tokens["admin"]
        
        # Test get transactions
        success, data = self.make_request('GET', 'transactions', 
                                         token=admin_token)
        self.log_test("Get transactions", success,
                     "" if success else f"Failed: {data}")
        
        # Test create transaction (admin only)
        # First get categories to use valid category_id
        cat_success, cat_data = self.make_request('GET', 'categories', 
                                                 token=admin_token)
        if cat_success and cat_data.get("data"):
            category_id = cat_data["data"][0]["id"]
            
            create_data = {
                "amount": 100.50,
                "type": "expense",
                "category_id": category_id,
                "description": "Test transaction",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "tags": ["test"],
                "notes": "API test transaction"
            }
            
            success, data = self.make_request('POST', 'transactions', 
                                             create_data, token=admin_token, 
                                             expected_status=200)
            if success:
                transaction_id = data.get("data", {}).get("id")
                self.log_test("Create transaction", True)
                
                # Test update transaction
                update_data = {"description": "Updated test transaction"}
                success, data = self.make_request('PATCH', f'transactions/{transaction_id}',
                                                 update_data, token=admin_token)
                self.log_test("Update transaction", success,
                             "" if success else f"Failed: {data}")
                
                # Test delete transaction
                success, data = self.make_request('DELETE', f'transactions/{transaction_id}',
                                                 token=admin_token)
                self.log_test("Delete transaction", success,
                             "" if success else f"Failed: {data}")
            else:
                self.log_test("Create transaction", False, f"Failed: {data}")
        
        # Test viewer cannot create transactions
        if "viewer" in self.tokens:
            success, data = self.make_request('POST', 'transactions', 
                                             {"amount": 50, "type": "expense"}, 
                                             token=self.tokens["viewer"], 
                                             expected_status=403)
            self.log_test("Viewer blocked from creating transactions", success,
                         "" if success else f"Should have returned 403: {data}")

    def test_dashboard(self):
        """Test dashboard endpoints"""
        print("\n🔍 Testing Dashboard...")
        
        for role in ["admin", "analyst", "viewer"]:
            if role in self.tokens:
                print(f"\n  Testing dashboard for {role}...")
                
                # Test summary
                success, data = self.make_request('GET', 'dashboard/summary',
                                                 token=self.tokens[role])
                self.log_test(f"{role} dashboard summary", success,
                             "" if success else f"Failed: {data}")
                
                # Test category breakdown
                success, data = self.make_request('GET', 'dashboard/category-breakdown',
                                                 token=self.tokens[role])
                self.log_test(f"{role} category breakdown", success,
                             "" if success else f"Failed: {data}")
                
                # Test trend
                success, data = self.make_request('GET', 'dashboard/trend',
                                                 token=self.tokens[role])
                self.log_test(f"{role} dashboard trend", success,
                             "" if success else f"Failed: {data}")
                
                # Test recent transactions
                success, data = self.make_request('GET', 'dashboard/recent',
                                                 token=self.tokens[role])
                self.log_test(f"{role} recent transactions", success,
                             "" if success else f"Failed: {data}")

    def test_insights(self):
        """Test insights endpoints (analyst/admin only)"""
        print("\n🔍 Testing Insights...")
        
        # Test admin and analyst can access insights
        for role in ["admin", "analyst"]:
            if role in self.tokens:
                success, data = self.make_request('GET', 'dashboard/insights',
                                                 token=self.tokens[role])
                self.log_test(f"{role} access insights", success,
                             "" if success else f"Failed: {data}")
        
        # Test viewer cannot access insights
        if "viewer" in self.tokens:
            success, data = self.make_request('GET', 'dashboard/insights',
                                             token=self.tokens["viewer"],
                                             expected_status=403)
            self.log_test("Viewer blocked from insights", success,
                         "" if success else f"Should have returned 403: {data}")

    def test_users(self):
        """Test users endpoints (admin only)"""
        print("\n🔍 Testing Users...")
        
        # Test admin can access users
        if "admin" in self.tokens:
            success, data = self.make_request('GET', 'users',
                                             token=self.tokens["admin"])
            self.log_test("Admin access users", success,
                         "" if success else f"Failed: {data}")
        
        # Test non-admin roles cannot access users
        for role in ["analyst", "viewer"]:
            if role in self.tokens:
                success, data = self.make_request('GET', 'users',
                                                 token=self.tokens[role],
                                                 expected_status=403)
                self.log_test(f"{role} blocked from users", success,
                             "" if success else f"Should have returned 403: {data}")

    def test_rbac_permissions(self):
        """Test role-based access control"""
        print("\n🔍 Testing RBAC Permissions...")
        
        # Verify role assignments
        for role, user_info in self.users.items():
            expected_role = role
            actual_role = user_info.get("role")
            success = actual_role == expected_role
            self.log_test(f"{role} has correct role assignment", success,
                         f"Expected {expected_role}, got {actual_role}" if not success else "")

    def run_all_tests(self):
        """Run complete test suite"""
        print("🚀 Starting FinLedger Backend API Tests")
        print(f"📍 Testing against: {self.base_url}")
        
        try:
            self.test_health_check()
            self.test_authentication()
            self.test_categories()
            self.test_transactions()
            self.test_dashboard()
            self.test_insights()
            self.test_users()
            self.test_rbac_permissions()
            
        except Exception as e:
            print(f"❌ Test suite failed with error: {e}")
            return False
        
        # Print summary
        print(f"\n📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        # Print failed tests
        failed_tests = [t for t in self.test_results if not t["success"]]
        if failed_tests:
            print(f"\n❌ Failed Tests ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"  • {test['name']}: {test['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test runner"""
    tester = FinLedgerAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())