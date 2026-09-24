# Manual Testing Guide - REDO Functionality

## Prerequisites
- Dev server is running at http://localhost:5173
- You have access to the application

## Complete Testing Flow

### Step 1: Create a Test Customer

1. Navigate to: `http://localhost:5173/sales/retail/order-entry/add-new-order`
2. Click the **"Add New Customer"** button (white button with blue border on the right)
3. Fill in the customer creation form:
   ```
   Customer Name: Test REDO Customer
   Phone Number: 0771234567
   Email: testredo@test.com
   Address: 123 Test Street
   Customer Type: Retail
   Account Status: Active
   ```
4. Click **Save/Submit**
5. Wait for success message
6. The new customer should now appear in the customer dropdown

---

### Step 2: Create First Order (This will be the order we REDO later)

1. **Stage 1 - Customer & Delivery Info:**
   - Select **"Test REDO Customer"** from the customer dropdown
   - Select **Delivery Type**: Normal
   - **Delivery Date** will auto-populate (3 days from today)
   - **Delivery Outlet**: Should default to your current branch
   - **Order Type**: Outlet Order
   - Click **"Next"**

2. **Stage 2 - Add Items:**
   - Click **"Add New Item"** button
   - Fill in item details:
     ```
     Item Type: Shirt (or any available item)
     Color: Blue
     Brand: Nike
     Quantity: 2
     Service Type: Washing
     Packing: Hanger
     ```
   - Click **Add**
   - Add another item:
     ```
     Item Type: Trouser
     Color: Black
     Brand: Levis
     Quantity: 1
     Service Type: Dry Clean
     Packing: Hanger
     ```
   - Click **Add**
   - You should see both items in the order list with calculated prices
   - Click **"Next"**

3. **Stage 3 - Payment:**
   - Note the **Total Amount** (should be > 0)
   - Enter **Advance Payment**: Enter the full amount or partial
   - Payment Method: Cash
   - Click **"Create Order"**
   - Wait for order creation
   - **IMPORTANT**: Note down the **Order ID** that was created (e.g., ORDER1, ORDER2, etc.)
   - The order should print/download

---

### Step 3: Test REDO Functionality

#### 3.1 Navigate Back and Select Customer

1. Navigate back to: `http://localhost:5173/sales/retail/order-entry/add-new-order`
2. Select **"Test REDO Customer"** from the dropdown
3. You should see:
   ```
   Customer: Test REDO Customer
   Phone Number: 0771234567
   ```

#### 3.2 Enable REDO and Verify Dropdown

4. Look for the **"Redo :"** checkbox (top right of Delivery Information section)
5. **Click the REDO checkbox** to enable it
6. **VERIFY**: You should see:
   - ✅ A loading spinner briefly appears with text "Loading customer orders..."
   - ✅ A dropdown appears below the REDO checkbox labeled **"Select Previous Orders to Redo"**
   - ✅ The dropdown should show the order you just created in this format:
     ```
     Order #ORDER1 - 1/31/2026 - Rs. 450.00
     ```

#### 3.3 Select Order and Verify Reference

7. **Click on the dropdown** and select the order
8. **VERIFY**: You should see:
   - ✅ The order is selected in the dropdown
   - ✅ A **blue reference box** appears below showing:
     ```
     REDO Order Reference:
     ORDER1
     ```
   - If you select multiple orders, they should show as: `ORDER1, ORDER2`

#### 3.4 Test with No Orders (Optional)

9. To test the "no orders" scenario:
   - Create a brand new customer who has never placed an order
   - Select that customer
   - Check the REDO checkbox
   - **VERIFY**: You should see a **yellow alert box** with:
     ```
     No previous orders found for this customer.
     This customer doesn't have any orders to redo.
     ```

#### 3.5 Complete REDO Order with Zero Prices

10. Go back to "Test REDO Customer" with REDO enabled and order selected
11. Select **Delivery Type**: Normal (or any type)
12. **Delivery Date** will auto-populate
13. **Delivery Outlet**: Select your branch
14. Click **"Next"**

15. **Stage 2 - Add Items:**
    - Click **"Add New Item"**
    - Add any item (e.g., Shirt, Washing, Quantity: 1)
    - Click **Add**
    - **VERIFY**: The item appears with **Price: Rs. 0.00** ✅
    - Add another item
    - **VERIFY**: This item also shows **Price: Rs. 0.00** ✅
    - **VERIFY**: In the Order Summary section:
      ```
      Total Amount: Rs. 0.00 ✅
      Delivery Charge: Rs. 0.00 ✅
      ```

16. Click **"Next"** to go to Stage 3
17. **VERIFY** in payment stage:
    - Total Amount: Rs. 0.00 ✅
    - You can leave advance payment as 0
18. Click **"Create Order"**
19. **VERIFY**: Order is created successfully with the REDO reference

---

### Step 4: Test REDO Toggle Off

1. Start a new order
2. Select "Test REDO Customer"
3. Check the REDO checkbox
4. Select an order from the dropdown
5. **Uncheck the REDO checkbox**
6. **VERIFY**:
   - ✅ The order dropdown **disappears**
   - ✅ The reference box **disappears**
7. Add items and verify prices are **calculated normally** (not 0)

---

### Step 5: Test Price Behavior

1. Enable REDO and select an order
2. Select **Delivery Type: Normal**
3. Add items - verify prices are 0
4. Change **Delivery Type to Express**
5. **VERIFY**: Prices **remain 0** (they should NOT update to express prices)
6. Add more items
7. **VERIFY**: New items also have **price 0**

---

## Expected Results Summary

| Test Case | Expected Result | Status |
|-----------|----------------|--------|
| Customer creation | Customer created successfully | ⬜ |
| First order creation | Order created with prices > 0 | ⬜ |
| REDO checkbox appears | Checkbox visible next to "Redo :" | ⬜ |
| Loading state | Spinner shows "Loading customer orders..." | ⬜ |
| Dropdown appears | Multi-select dropdown appears when REDO checked | ⬜ |
| Orders displayed | Previous orders shown with ID, Date, Amount | ⬜ |
| Order selection | Can select one or multiple orders | ⬜ |
| Reference display | Blue box shows selected order IDs | ⬜ |
| No orders message | Yellow alert when customer has no orders | ⬜ |
| Zero prices | All item prices = Rs. 0.00 when REDO active | ⬜ |
| Zero delivery charge | Delivery charge = Rs. 0.00 when REDO active | ⬜ |
| Zero total | Total amount = Rs. 0.00 | ⬜ |
| Toggle off clears | Dropdown disappears when REDO unchecked | ⬜ |
| Price stays zero | Prices don't change when delivery type changes | ⬜ |
| Order creation | REDO order created successfully | ⬜ |

---

## Troubleshooting

### Issue: Dropdown doesn't appear
- **Check**: Is a customer selected?
- **Check**: Is the REDO checkbox checked?
- **Check**: Open browser console (F12) and look for errors

### Issue: "Loading..." never finishes
- **Check**: Browser console for API errors
- **Check**: Network tab to see if API call is made to `/order/get-all-orders-by-customer-id`
- **Check**: Backend server is running

### Issue: Prices are not zero
- **Check**: REDO checkbox is checked
- **Check**: Browser console for JavaScript errors
- **Check**: Items were added AFTER REDO was enabled

### Issue: Order reference not showing
- **Check**: Orders are actually selected in the dropdown
- **Check**: Browser console for errors

---

## Browser Console Check

Open browser console (F12) and check for:
- ✅ No red errors
- ✅ API call to `/order/get-all-orders-by-customer-id` returns 200 OK
- ✅ Response contains orders array

---

## Success Criteria

All checkboxes in the "Expected Results Summary" table should be checked ✅

If any test fails, please share:
1. Which step failed
2. Screenshot of the issue
3. Browser console errors (if any)
4. Network tab showing API response (if applicable)
