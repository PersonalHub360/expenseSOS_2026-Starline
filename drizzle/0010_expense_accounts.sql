ALTER TABLE "expenses" ADD COLUMN "account_id" uuid;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "expenses_account_id_idx" ON "expenses" ("account_id");

ALTER TABLE "vendor_payments" ADD COLUMN "account_id" uuid;
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "vendor_payments_account_id_idx" ON "vendor_payments" ("account_id");

ALTER TABLE "account_transactions" ADD COLUMN "expense_id" uuid;
ALTER TABLE "account_transactions" ADD COLUMN "vendor_payment_id" uuid;
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "account_transactions" ADD CONSTRAINT "account_transactions_vendor_payment_id_vendor_payments_id_fk" FOREIGN KEY ("vendor_payment_id") REFERENCES "vendor_payments"("id") ON DELETE restrict ON UPDATE no action;
CREATE UNIQUE INDEX "account_transactions_expense_withdrawal_unique" ON "account_transactions" ("expense_id") WHERE "expense_id" IS NOT NULL AND "kind" = 'withdrawal';
CREATE UNIQUE INDEX "account_transactions_expense_deposit_unique" ON "account_transactions" ("expense_id") WHERE "expense_id" IS NOT NULL AND "kind" = 'deposit';
CREATE UNIQUE INDEX "account_transactions_vendor_payment_withdrawal_unique" ON "account_transactions" ("vendor_payment_id") WHERE "vendor_payment_id" IS NOT NULL AND "kind" = 'withdrawal';
