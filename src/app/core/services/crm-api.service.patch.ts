// ─────────────────────────────────────────────────────────────────────────────
// PATCH: src/app/core/services/crm-api.service.ts
//
// Dodaj poniższe dwie metody do klasy CrmApiService.
// Miejsce: w bloku metod dla leadów, np. po getLeadDocuments().
// ─────────────────────────────────────────────────────────────────────────────

  // ── Konto testowe ────────────────────────────────────────────────────────────

  /** Pobiera zapisane dane konta testowego dla danego Leada (lub null). */
  getLeadTestAccount(leadId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/leads/${leadId}/test-account`);
  }

  /**
   * Zapisuje dane i wywołuje zewnętrzne API CreateTestAccount.
   * Zwraca { record, accountNumber } przy sukcesie (HTTP 201).
   * Rzuca błąd HTTP 422 z { error, record } gdy zewnętrzne API odmówi.
   */
  createLeadTestAccount(leadId: number, data: {
    subdomain: string;
    language: string;
    partner_currency: string;
    country: string;
    billing_address: string;
    billing_zip: string;
    billing_city: string;
    billing_country: string;
    billing_email_address: string;
    admin_first_name: string;
    admin_last_name: string;
    admin_email: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.base}/leads/${leadId}/test-account`, data);
  }

// ─────────────────────────────────────────────────────────────────────────────
// KONIEC PATCH
// ─────────────────────────────────────────────────────────────────────────────
