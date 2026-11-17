import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { 
  calculateFIFOGrossProfit, 
  reconcileTransactionsFifo,
  verifyBatchStockIntegrity,
  reconcileBatchStockIntegrity,
  reconcileAllBatchStockIntegrity
} from './utils/fifoUtils';

// Expose FIFO and Batch Stock Integrity verification functions globally on window
if (typeof window !== 'undefined') {
  (window as any).calculateFIFOGrossProfit = calculateFIFOGrossProfit;
  (window as any).reconcileTransactionsFifo = reconcileTransactionsFifo;
  (window as any).verifyBatchStockIntegrity = verifyBatchStockIntegrity;
  (window as any).reconcileBatchStockIntegrity = reconcileBatchStockIntegrity;
  (window as any).reconcileAllBatchStockIntegrity = reconcileAllBatchStockIntegrity;
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

