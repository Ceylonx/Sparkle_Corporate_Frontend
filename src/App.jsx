import { useState } from 'react'
import './App.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ScrollToTop from './utils/ScrollToTop';
import ProtectedRoutes from './utils/ProtectedRoutes';
import SelectionScreen from './pages/SelectionScreen';
import SalesRetailAttendanceTracking from './pages/retail/SalesRetailAttendanceTracking';
import SalesRetailLayout from './layouts/SalesRetailLayout';
import SalesRetailDashboard from './pages/retail/SalesRetailDashboard';
import SalesRetailCustomers from './pages/retail/SalesRetailCustomers';
import SalesRetailOrderEntry from './pages/retail/SalesRetailOrderEntry';
import RetailAddNewOrder from './pages/retail/orderEntry/RetailAddNewOrder';
import SalesRetailServiceOrder from './pages/retail/SalesRetailServiceOrder';
import SalesRetailViewServiceOrder from './pages/retail/serviceOrder/SalesRetailViewServiceOrder';
import SalesRetailToProduction from './pages/retail/SalesRetailToProduction';
import SalesRetailBackToOutlet from './pages/retail/SalesRetailBackToOutlet';
import SalesRetailInvoice from './pages/retail/SalesRetailInvoice';
import SalesRetailViewInvoice from './pages/retail/invoice/SalesRetailViewInvoice';
import SalesRetailGenerateInvoice from './pages/retail/invoice/SalesRetailGenerateInvoice';
import SalesRetailSettings from './pages/retail/SalesRetailSettings';
import SalesRetailPriceListUpload from './pages/retail/settings/SalesRetailPriceListUpload';
import SalesRetailVoucherUpload from './pages/retail/settings/SalesRetailVoucherUpload';
import SalesCorporateLayout from './layouts/SalesCorporateLayout';
import SalesCorporateDashboard from './pages/corporate/SalesCorporateDashboard';
import SalesCorporateCustomers from './pages/corporate/SalesCorporateCustomers';
import SalesCorporatePickupEntry from './pages/corporate/SalesCorporatePickupEntry';
import SalesCorporateProduction from './pages/corporate/SalesCorporateProduction';
import SalesCorporateDelivery from './pages/corporate/SalesCorporateDelivery';
import SalesCorporateInvoicing from './pages/corporate/SalesCorporateInvoicing';
import SalesCorporateReceivePayment from './pages/corporate/SalesCorporateReceivePayment';
import SalesCorporateDepositNow from './pages/corporate/SalesCorporateDepositNow';
import SalesCorporateReport from './pages/corporate/SalesCorporateReport';
import SalesCorporateSettings from './pages/corporate/SalesCorporateSettings';
import SalesCorporatePriceListUpload from './pages/corporate/settings/SalesCorporatePriceListUpload';
import SalesCorporateItemDetails from './pages/corporate/settings/SalesCorporateItemDetails';
import CorporateAddNewOrder from './pages/corporate/pickupEntry/CorporateAddNewOrder';
import CorporateProductionSort from './pages/corporate/production/CorporateProductionSort';
import CorporateProductionServiceOrder from './pages/corporate/production/CorporateProductionServiceOrder';
import CorporateProductionPacking from './pages/corporate/production/CorporateProductionPacking';
import CorporateDeliveryEntry from './pages/corporate/delivery/CorporateDeliveryEntry';
import CorporateDeliveryView from './pages/corporate/delivery/CorporateDeliveryView';
import CorporateDeliveryNotePreview from './pages/corporate/delivery/CorporateDeliveryNotePreview';
import CorporateDailyInvoiceView from './pages/corporate/invoicing/CorporateDailyInvoiceView';
import CorporateDailyInvoiceGenerate from './pages/corporate/invoicing/CorporateDailyInvoiceGenerate';
import AxiosInterceptor from './utils/AxiosInterceptor';
import RetailUpdateOrder from './pages/retail/orderEntry/RetailUpdateOrder';
import SalesRetailViewToProductionPending from './pages/retail/toProduction/SalesRetailViewToProductionPending';
import SalesRetailViewToProductionComplete from './pages/retail/toProduction/SalesRetailViewToProductionComplete';
import SalesRetailViewBackToOutletPending from './pages/retail/backToOutlet/SalesRetailViewBackToOutletPending';
import SalesRetailViewBackToOutletComplete from './pages/retail/backToOutlet/SalesRetailViewBackToOutletComplete';
import CorporatePeriodInvoiceView from './pages/corporate/invoicing/CorporatePeriodInvoiceView';
import CorporatePeriodInvoicePreview from './pages/corporate/invoicing/CorporatePeriodInvoicePreview';
import CorporatePeriodInvoicingGenerate from './pages/corporate/invoicing/CorporatePeriodInvoicingGenerate';
import SalesCorporateInvoicingGenerate from './pages/corporate/invoicing/SalesCorporateInvoicingGenerate';
import CorporateUpdatePickupEntry from './pages/corporate/pickupEntry/CorporateUpdatePickupEntry';
import SalesCorporateCreditDebitNotes from './pages/corporate/SalesCorporateCreditDebitNotes';
import CorporateViewPickupEntry from './pages/corporate/pickupEntry/CorporateViewPickupEntry';
import SalesRetailViewToProductionReceive from './pages/retail/toProduction/SalesRetailViewToProductionReceive';
import SalesRetailViewBackToOutletReceive from './pages/retail/backToOutlet/SalesRetailViewBackToOutletReceive';
import CorporatePayInvoice from './pages/corporate/receivePayment/CorporatePayInvoice';
import CorporateCustomerPaymentConfirm from './pages/corporate/receivePayment/CorporateCustomerPaymentConfirm';
import CorporatePaymentReceiptPreview from './pages/corporate/receivePayment/CorporatePaymentReceiptPreview';
import CorporateSalesReceiptView from './pages/corporate/receivePayment/CorporateSalesReceiptView';
import ProtectedRoutesRetail from './utils/ProtectedRoutesRetail';
import Report from './pages/corporate/reports/Report';
import CopCusWideDailySalesReport from './pages/corporate/reports/CopCusWideDailySalesReport';
import YTDCopCusWiseSalesReport from './pages/corporate/reports/YTDCopCusWiseSalesReport';
import PendingOrderReport from './pages/corporate/reports/PendingOrderReport';
import ItemWiseSalesReport from './pages/corporate/reports/ItemWiseSalesReport';
import InvoiceWiseSalesReport from './pages/corporate/reports/InvoiceWiseSalesReport';
import ViewRetailOrderPublic from './pages/retail/ViewRetailOrderPublic';
import ViewRetailCollectionOrderPublic from './pages/retail/ViewRetailCollectionOrderPublic';


function App() {
  document.querySelectorAll('input[type=number]').forEach((input) => {
    input.addEventListener("wheel", function (e) {
      e.preventDefault(); // disable scroll changing value
    });
  });

  return (
    <BrowserRouter>
      <AxiosInterceptor />
      <ScrollToTop />
      <Routes>
        {/* Public: customer order view from SMS link – no login required */}
        <Route path="/salesCorporate/retail/order/:orderId" element={<ViewRetailOrderPublic />} />
        <Route path="/salesCorporate/retail/collection-order/:orderId" element={<ViewRetailCollectionOrderPublic />} />
        <Route element={<ProtectedRoutes />}>
          <Route path='/salesCorporate/' element={<SelectionScreen />} />
          <Route path='/salesCorporate/retail/attendance' element={<SalesRetailAttendanceTracking />} />

          <Route element={<ProtectedRoutesRetail />}>
            <Route path='/salesCorporate/' element={<SalesRetailLayout />} >
              <Route path='/salesCorporate/retail/dashboard' element={<SalesRetailDashboard />} />
              <Route path='/salesCorporate/retail/customers' element={<SalesRetailCustomers />} />
              <Route path='/salesCorporate/retail/order-entry' element={<SalesRetailOrderEntry />} />
              <Route path='/salesCorporate/retail/order-entry/add-new-order' element={<RetailAddNewOrder />} />
              <Route path='/salesCorporate/retail/order-entry/update-order/:id' element={<RetailUpdateOrder requiredPermission="SalesRetail_Order_Edit" />} />
              <Route path='/salesCorporate/retail/service-order' element={<SalesRetailServiceOrder />} />
              <Route path='/salesCorporate/retail/service-order/:id' element={<SalesRetailViewServiceOrder />} />
              <Route path='/salesCorporate/retail/service-order/update-order/:id' element={<RetailUpdateOrder requiredPermission="SalesRetail_Service_Edit" />} />
              <Route path='/salesCorporate/retail/to-production' element={<SalesRetailToProduction />} />
              <Route path='/salesCorporate/retail/to-production/pending/:id' element={<SalesRetailViewToProductionPending />} />
              <Route path='/salesCorporate/retail/to-production/receive/:id' element={<SalesRetailViewToProductionReceive />} />
              <Route path='/salesCorporate/retail/to-production/update-order/:id' element={<RetailUpdateOrder requiredPermission="SalesRetail_To_Production_Edit" />} />
              <Route path='/salesCorporate/retail/to-production/complete/:id' element={<SalesRetailViewToProductionComplete />} />
              <Route path='/salesCorporate/retail/back-to-outlet' element={<SalesRetailBackToOutlet />} />
              <Route path='/salesCorporate/retail/back-to-outlet/pending/:id' element={<SalesRetailViewBackToOutletPending />} />
              <Route path='/salesCorporate/retail/back-to-outlet/receive/:id' element={<SalesRetailViewBackToOutletReceive />} />
              <Route path='/salesCorporate/retail/back-to-outlet/update-order/:id' element={<RetailUpdateOrder requiredPermission="SalesRetail_Back_to_Outlet_Edit" />} />
              <Route path='/salesCorporate/retail/back-to-outlet/complete/:id' element={<SalesRetailViewBackToOutletComplete />} />
              <Route path='/salesCorporate/retail/invoice' element={<SalesRetailInvoice />} />
              <Route path='/salesCorporate/retail/invoice/:id' element={<SalesRetailViewInvoice />} />
              <Route path='/salesCorporate/retail/invoice/:id/generate' element={<SalesRetailGenerateInvoice />} />
              <Route path='/salesCorporate/retail/invoice/update-order/:id' element={<RetailUpdateOrder requiredPermission="SalesRetail_Invoice_Edit" />} />
              <Route path='/salesCorporate/retail/settings' element={<SalesRetailSettings />} />
              <Route path='/salesCorporate/retail/settings/price-list-upload' element={<SalesRetailPriceListUpload />} />
              <Route path='/salesCorporate/retail/settings/voucher-upload' element={<SalesRetailVoucherUpload />} />
            </Route>
          </Route>

          <Route path='/salesCorporate/corporate' element={<SalesCorporateLayout />} >
            <Route path='/salesCorporate/corporate/dashboard' element={<SalesCorporateDashboard />} />
            <Route path='/salesCorporate/corporate/customers' element={<SalesCorporateCustomers />} />
            <Route path='/salesCorporate/corporate/pickup-entry' element={<SalesCorporatePickupEntry />} />
            <Route path='/salesCorporate/corporate/pickup-entry/add-new-order' element={<CorporateAddNewOrder />} />
            <Route path='/salesCorporate/corporate/pickup-entry/update-order/:id' element={<CorporateUpdatePickupEntry />} />
            <Route path='/salesCorporate/corporate/pickup-entry/view/:id' element={<CorporateViewPickupEntry />} />
            <Route path='/salesCorporate/corporate/production' element={<SalesCorporateProduction />} />
            <Route path='/salesCorporate/corporate/production/sort/:id' element={<CorporateProductionSort />} />
            <Route path='/salesCorporate/corporate/production/service-order/:id' element={<CorporateProductionServiceOrder />} />
            <Route path='/salesCorporate/corporate/production/packing/:id' element={<CorporateProductionPacking />} />
            <Route path='/salesCorporate/corporate/delivery' element={<SalesCorporateDelivery />} />
            <Route path='/salesCorporate/corporate/delivery/note/:id' element={<CorporateDeliveryNotePreview />} />
            <Route path='/salesCorporate/corporate/delivery/:id' element={<CorporateDeliveryView />} />
            <Route path='/salesCorporate/corporate/delivery/entry/:id' element={<CorporateDeliveryEntry />} />
            <Route path='/salesCorporate/corporate/invoicing' element={<SalesCorporateInvoicing />} />
            <Route path='/salesCorporate/corporate/credit-debit-notes' element={<SalesCorporateCreditDebitNotes />} />
            <Route path='/salesCorporate/corporate/invoicing/generate/:type/:customerId' element={<SalesCorporateInvoicingGenerate />} />
            <Route path='/salesCorporate/corporate/invoicing/daily/:cus' element={<CorporateDailyInvoiceView />} />
            <Route path='/salesCorporate/corporate/invoicing/daily/:cus/:id' element={<CorporateDailyInvoiceGenerate />} />
            <Route path='/salesCorporate/corporate/invoicing/period/:cus' element={<CorporatePeriodInvoiceView />} />
            <Route path='/salesCorporate/corporate/invoicing/period/:cus/preview' element={<CorporatePeriodInvoicePreview />} />
            <Route path='/salesCorporate/corporate/invoicing/period/:cus/:id' element={<CorporatePeriodInvoicingGenerate />} />
            <Route path='/salesCorporate/corporate/receive-payment' element={<SalesCorporateReceivePayment />} />
            <Route path='/salesCorporate/corporate/receive-payment/pay/:id' element={<CorporatePayInvoice />} />
            <Route path='/salesCorporate/corporate/receive-payment/confirm/:customerId' element={<CorporateCustomerPaymentConfirm />} />
            {/* Payment Receipt Preview Route */}
            <Route path='/salesCorporate/corporate/payment-receipt/preview' element={<CorporatePaymentReceiptPreview />} />
            <Route path='/salesCorporate/corporate/receive-payment/salesCorporate-receipt' element={<CorporateSalesReceiptView />} />
            <Route path='/salesCorporate/corporate/deposit-now' element={<SalesCorporateDepositNow />} />
            <Route path='/salesCorporate/corporate/report' element={<SalesCorporateReport />} />
            <Route path='/salesCorporate/corporate/report/1' element={<Report />} />
            <Route path='/salesCorporate/corporate/report/cop-cus-wise-daily-sales-report' element={<CopCusWideDailySalesReport />} />
            <Route path='/salesCorporate/corporate/report/ytd-cus-wise-sales-report' element={<YTDCopCusWiseSalesReport />} />
            <Route path='/salesCorporate/corporate/report/item-wise-sales-report' element={<ItemWiseSalesReport />} />
            <Route path='/salesCorporate/corporate/report/invoice-wise-sales-report' element={<InvoiceWiseSalesReport />} />
            <Route path='/salesCorporate/corporate/report/pending-order-report' element={<PendingOrderReport />} />
            <Route path='/salesCorporate/corporate/settings' element={<SalesCorporateSettings />} />
            <Route path='/salesCorporate/corporate/settings/price-list-upload/:id' element={<SalesCorporatePriceListUpload />} />
            <Route path='/salesCorporate/corporate/settings/item-details/:itemId' element={<SalesCorporateItemDetails />} />
          </Route>

        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
