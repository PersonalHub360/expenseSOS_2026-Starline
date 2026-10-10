import { Route, Switch } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { flattenNavigation } from "@/lib/navigation";
import { ComingSoonPage } from "@/pages/ComingSoonPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { ProjectDetailPage } from "@/pages/ProjectDetailPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { PropertiesPage } from "@/pages/PropertiesPage";
import { BuyerDetailPage } from "@/pages/BuyerDetailPage";
import { BuyersPage } from "@/pages/BuyersPage";
import { ManualSlipPage } from "@/pages/ManualSlipPage";
import { PaymentReceiptPage, RefundReceiptPage } from "@/pages/ReceiptPage";
import { SaleDetailPage } from "@/pages/SaleDetailPage";
import { SalesPage } from "@/pages/SalesPage";
import { ExpenseDetailPage } from "@/pages/ExpenseDetailPage";
import { ExpensesPage } from "@/pages/ExpensesPage";
import { PurchasesPage } from "@/pages/PurchasesPage";
import { AccountDetailPage } from "@/pages/AccountDetailPage";
import { AccountsPage } from "@/pages/AccountsPage";
import { EmployeeDetailPage } from "@/pages/EmployeeDetailPage";
import { EmployeesPage } from "@/pages/EmployeesPage";
import { InvestmentDetailPage } from "@/pages/InvestmentDetailPage";
import { InvestmentsPage } from "@/pages/InvestmentsPage";
import { SalarySlipPage } from "@/pages/SalarySlipPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { UsersPage } from "@/pages/UsersPage";

const moduleRoutes = flattenNavigation().filter(
  (item) => item.href !== "/" && item.status === "coming-soon",
);

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background text-sm text-muted-foreground">
        Checking your session…
      </main>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <AppShell>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/projects/:id" component={ProjectDetailPage} />
        <Route path="/projects" component={ProjectsPage} />
        <Route path="/properties" component={PropertiesPage} />
        <Route path="/buyers/:id" component={BuyerDetailPage} />
        <Route path="/buyers" component={BuyersPage} />
        <Route path="/sales/:id" component={SaleDetailPage} />
        <Route path="/sales" component={SalesPage} />
        <Route path="/payments/slips/:id" component={ManualSlipPage} />
        <Route path="/payments/refunds/:id/receipt" component={RefundReceiptPage} />
        <Route path="/payments/:id/receipt" component={PaymentReceiptPage} />
        <Route path="/payments" component={PaymentsPage} />
        <Route path="/expenses/:id" component={ExpenseDetailPage} />
        <Route path="/expenses" component={ExpensesPage} />
        <Route path="/purchases" component={PurchasesPage} />
        <Route path="/investments/:id" component={InvestmentDetailPage} />
        <Route path="/investments" component={InvestmentsPage} />
        <Route path="/accounts/:id" component={AccountDetailPage} />
        <Route path="/accounts" component={AccountsPage} />
        <Route path="/employees/:id/slips/:slipId" component={SalarySlipPage} />
        <Route path="/employees/:id" component={EmployeeDetailPage} />
        <Route path="/employees" component={EmployeesPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/users" component={UsersPage} />
        {moduleRoutes.map((item) => (
          <Route key={item.href} path={item.href} component={ComingSoonPage} />
        ))}
        <Route component={NotFoundPage} />
      </Switch>
    </AppShell>
  );
}
