import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { NavBackService } from '../../../core/services/nav-back.service';
import { ToastService } from '../../../core/services/toast.service';

const API = `${environment.apiUrl}/admin/prospects`;

// Definicja sygnałów ICP (dopasowanie do CRMtree) — klucze muszą odpowiadać
// polom icp_signals[].id zwracanym przez backend (decyzja 19.08.2026, artefakt
// "Sygnały Prospektów"). Sygnały 9-11 (rekrutacja/raportowanie/call center)
// nie są tu jeszcze — wymagają portali z ofertami pracy, niepodpięte.
// reasoningKey — nazwa pola w enrichment_log.claude.signal_reasoning (patrz
// backend ICP_SIGNALS.promptKey, prospectEnrichmentService.js). Rozjeżdża się
// z `key` (id sygnału) dla 7 z 8 sygnałów — bez tego mapowania
// getSignalReasoning() cicho nie znajdowała uzasadnienia mimo że było zapisane
// w bazie (audyt 24.08, Wodmax/Targor-Truck/Parmet).
const SIGNAL_DEFS = [
  {
    key: 'dzial_handlowy', reasoningKey: 'field_sales_team', label: 'Dział handlowy',
    desc: 'Dedykowani handlowcy, w miarę możności formalna struktura sprzedaży.',
  },
  {
    key: 'zlozony_proces_sprzedazy', reasoningKey: 'custom_quote_process', label: 'Ind. wycena',
    desc: 'Złożony proces sprzedaży / indywidualna wycena — relacyjny, projektowy lub negocjacyjny model, nie zakup impulsowy.',
  },
  {
    key: 'konsultacja_demo', reasoningKey: 'consultation_demo_needs_analysis', label: 'Konsultacja/demo',
    desc: 'Sprzedaż wymaga rozmowy przed zakupem — demo, bezpłatna konsultacja, analiza potrzeb.',
  },
  {
    key: 'opieka_nad_klientem', reasoningKey: 'dedicated_customer_care_b2b', label: 'Opieka B2B',
    desc: 'Dedykowana opieka nad klientem B2B — przypisany opiekun, Key Account Manager, Customer Success.',
  },
  {
    key: 'przetargi', reasoningKey: 'tender_bidding_department', label: 'Przetargi',
    desc: 'Firma sprzedaje w przetargach / ma dział ofertowania — nie: kupuje w przetargach.',
  },
  {
    key: 'rozproszona_struktura', reasoningKey: 'distributed_sales_structure', label: 'Wiele oddziałów',
    desc: 'Zespół lub sieć sprzedaży fizycznie rozproszona terytorialnie — konkretni przedstawiciele/oddziały z ludźmi.',
  },
  {
    key: 'siec_partnerow', reasoningKey: 'partner_dealer_network', label: 'Sieć partnerów',
    desc: 'Firma buduje lub rozwija sieć sprzedaży pośredniej — dealerzy, dystrybutorzy.',
  },
  {
    key: 'ecommerce_b2b', reasoningKey: 'ecommerce_b2b', label: 'E-commerce B2B',
    desc: 'Sklep/platforma zamówieniowa B2B z realną obsługą — liczy się tylko razem z działem handlowym lub opieką nad klientem.',
  },
] as const;

interface KeyContact {
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
}

interface EnrichmentLog {
  timestamp: string;
  gus?: {
    found: boolean;
    regon: string | null;
    official_name: string | null;
    entity_type: string | null;
    pkd_main: string | null;
    pkd_codes: string[];
    error?: string;
  };
  krs?: {
    found: boolean;
    krs_number: string | null;
    legal_form: string | null;
    branches_count: number | null;
    branches_scope: string | null;
    had_website: boolean;
  };
  website?: {
    url: string | null;
    method: string;
    chars_extracted?: number;
    pages_count?: number;
  };
  claude?: {
    provider: string;
    model: string;
    icp_raw: number | null;
    icp_bonus: number | null;
    icp_total: number | null;
    gate_status: string | null;
    signal_reasoning: Record<string, string> | null;
  };
}

interface IcpSignalHit {
  id: string;
  label: string;
  tier: 'wysoka' | 'srednia';
  points: number;
  hit: boolean;
  suppressed: boolean;
}

interface IcpBonusHit {
  id: string;
  label: string;
  points: number;
  hit: boolean;
}

interface IcpGates {
  b2b: 'pass' | 'fail' | 'unknown';
  company_size: 'pass' | 'fail' | 'unknown';
}

interface IcpDowngradeFlag {
  id: string;
  label: string;
  points?: number;
  matched?: string[];
}

interface Prospect {
  id: number;
  nip: string;
  regon: string | null;
  company_name: string | null;
  imported_at: string;
  krs_number: string | null;
  legal_form: string | null;
  branches_count: number | null;
  branches_scope: string | null;
  website_url: string | null;
  website_status: 'ok' | 'failed' | 'not_found' | 'blocked' | null;
  employment_range: string | null;
  // Dane z pliku importu
  employment_count: number | null;
  annual_revenue: number | null;
  founding_year: number | null;
  company_size: string | null;
  industry: string | null;
  company_profile: string | null;
  decision_maker_name: string | null;
  decision_maker_title: string | null;
  decision_maker_dept: string | null;
  decision_maker_phone: string | null;
  decision_maker_email: string | null;
  city: string | null;
  voivodeship: string | null;
  pkd_id: string | null;
  pkd_description: string | null;
  source_database: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  linkedin_status: 'ok' | 'blocked' | 'not_found' | null;
  pracuj_url: string | null;
  pracuj_status: 'ok' | 'not_found' | null;
  decision_maker_linkedin: string | null;
  decision_maker_facebook: string | null;
  // Wyniki enrichmentu
  fb_about: string | null;
  fb_category: string | null;
  fb_fan_count: number | null;
  icp_score: number | null;
  icp_signals: IcpSignalHit[] | null;
  icp_gates: IcpGates | null;
  icp_gate_status: 'qualified' | 'disqualified' | 'needs_review' | null;
  icp_bonus_signals: IcpBonusHit[] | null;
  icp_downgrade_flags: IcpDowngradeFlag[] | null;
  ai_summary: string | null;
  key_contacts: KeyContact[] | null;
  enrichment_log: EnrichmentLog | null;
  enriched_at: string | null;
  enrichment_status: string;
  enrichment_error: string | null;
  crm_lead_id: number | null;
  has_lead: boolean;
  lead_id: number | null;
  has_partner: boolean;
  partner_nav_id: string | null;
  note: string | null;
  note_author: string | null;
  note_updated_at: string | null;
}

interface BatchProgress {
  running: boolean;
  total: number;
  done: number;
  errors: number;
  processing_ids?: number[];
}

@Component({
  selector: 'wt-admin-prospects',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div id="topbar">
      <span class="page-title">Prospekty — Enrichment firm</span>
      <span class="tsp"></span>
      <button class="btn btn-g" (click)="exportCsv()">⬇ Eksport CSV</button>
      <button class="btn btn-p"
        [disabled]="batch().running || enriching()"
        (click)="startBatch()">
        @if (batch().running) {
          ⏳ {{ batch().done }}/{{ batch().total }} firm…
        } @else {
          ▶ Uruchom enrichment
        }
      </button>
    </div>

    @if (navBack.ctx(); as ctx) {
      <div style="padding:5px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb">
        <button (click)="navigateBack()" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:white;border:1px solid #e2e8f0;border-radius:6px;color:#64748b;font-size:12px;font-weight:500;cursor:pointer;line-height:1">
          ← {{ctx.label}}
        </button>
      </div>
    }

    <div id="content">

      <!-- Import CSV -->
      <div class="card" style="margin-bottom:16px;padding:16px">
        <div style="font-weight:600;margin-bottom:10px">Import firm z CSV</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px">
          Wymagane kolumny: <code>nip</code>, <code>BAZA</code> (nazwa bazy źródłowej — musi mieć wartość w każdym wierszu). Wykrywane automatycznie:
          <code>www</code>, <code>krs</code>, <code>company_name</code>/<code>nazwa</code>,
          <code>branża</code>, <code>profil</code>, <code>zatrudnienie</code>, <code>obrot</code>,
          <code>rok</code>, <code>miasto</code>, <code>województwo</code>, <code>PKD-ID</code>,
          <code>PKD-opis</code>, <code>Osoba Decyzyjna</code>, <code>Stanowisko</code>,
          <code>Komórka</code>, <code>Telefon</code>, <code>Email</code>.
          Podanie kolumny <code>www</code> pozwala pominąć autodiscovery (tańsze, szybsze).
          Duplikaty (ten sam NIP) aktualizują istniejący rekord.
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <label class="btn btn-g" style="cursor:pointer;margin:0">
            📁 Wybierz plik CSV
            <input type="file" accept=".csv" style="display:none"
              (change)="onFileSelected($event)">
          </label>
          @if (importFile()) {
            <span style="font-size:13px;color:#374151">{{ importFile()!.name }}</span>
            <button class="btn btn-p" [disabled]="importing()" (click)="doImport()">
              @if (importing()) { Importuję… } @else { Importuj }
            </button>
          }
        </div>
        @if (importResult()) {
          @if (importResult()!.fatal_error) {
            <div style="margin-top:10px;font-size:13px;padding:8px 12px;border-radius:6px;
                        border:1px solid #fca5a5;background:#fee2e2;color:#991b1b">
              ✗ Błąd importu: <b>{{ importResult()!.fatal_error }}</b>
            </div>
          } @else {
            <div style="margin-top:10px;font-size:13px;padding:8px 12px;border-radius:6px;border:1px solid"
              [style.background]="importResult()!.errors! > 0 ? '#fef3c7' : '#f0fdf4'"
              [style.borderColor]="importResult()!.errors! > 0 ? '#fcd34d' : '#86efac'"
              [style.color]="importResult()!.errors! > 0 ? '#92400e' : '#166534'">
              ✓ Dodano: <b>{{ importResult()!.added }}</b> &nbsp;|&nbsp;
              Pominięto (duplikaty): <b>{{ importResult()!.skipped }}</b> &nbsp;|&nbsp;
              Błędy: <b>{{ importResult()!.errors }}</b> &nbsp;|&nbsp;
              Razem wierszy: <b>{{ importResult()!.total }}</b>
              @if (importResult()!.detected_encoding) {
                <div style="margin-top:6px;font-size:11px;opacity:0.8">
                  Kodowanie: <b>{{ importResult()!.detected_encoding }}</b>
                  @if (importResult()!.detected_columns?.length) {
                    &nbsp;|&nbsp; Kolumny: {{ importResult()!.detected_columns!.join(', ') }}
                  }
                </div>
              } @else if (importResult()!.detected_columns?.length) {
                <div style="margin-top:6px;font-size:11px;opacity:0.8">
                  Wykryte kolumny: {{ importResult()!.detected_columns!.join(', ') }}
                </div>
              }
              @if (importResult()!.error_details?.length) {
                <div style="margin-top:8px;border-top:1px solid #fcd34d;padding-top:8px">
                  <div style="font-weight:600;margin-bottom:4px">Szczegóły błędów:</div>
                  @for (e of importResult()!.error_details!; track e) {
                    <div style="font-size:12px;margin-bottom:2px">• {{ e }}</div>
                  }
                </div>
              }
            </div>
          }
        }
      </div>

      <!-- Filtry -->
      <div class="card" style="margin-bottom:16px;padding:16px">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">

          <div class="fld">
            <label>Szukaj</label>
            <input class="inp" [(ngModel)]="filters.search" placeholder="nazwa, NIP lub baza"
              (ngModelChange)="onFilterChange()" style="width:180px">
          </div>

          <div class="fld">
            <label>Status</label>
            <select class="inp" [(ngModel)]="filters.status" (ngModelChange)="onFilterChange()">
              <option value="">Wszystkie</option>
              <option value="pending">Oczekujące</option>
              <option value="done">Wzbogacone</option>
              <option value="error">Błąd</option>
              <option value="no_krs">Brak w KRS</option>
              <option value="no_website">Brak strony WWW</option>
              <option value="hold">Hold</option>
              <option value="archived">Archiwum</option>
              <option value="lead">Lead w CRM</option>
            </select>
          </div>

          <div class="fld">
            <label>Score min</label>
            <input class="inp" type="number" min="0" max="100" [(ngModel)]="filters.score_min"
              (ngModelChange)="onFilterChange()" style="width:80px">
          </div>

          <div class="fld">
            <label>Score max</label>
            <input class="inp" type="number" min="0" max="100" [(ngModel)]="filters.score_max"
              (ngModelChange)="onFilterChange()" style="width:80px">
          </div>

          <div class="fld">
            <label>Importowano od</label>
            <input class="inp" type="date" [(ngModel)]="filters.imported_from"
              (ngModelChange)="onFilterChange()">
          </div>

          <div class="fld">
            <label>Importowano do</label>
            <input class="inp" type="date" [(ngModel)]="filters.imported_to"
              (ngModelChange)="onFilterChange()">
          </div>

          <div class="fld">
            <label>Enrichment od</label>
            <input class="inp" type="date" [(ngModel)]="filters.enriched_from"
              (ngModelChange)="onFilterChange()">
          </div>

          <div class="fld">
            <label>Enrichment do</label>
            <input class="inp" type="date" [(ngModel)]="filters.enriched_to"
              (ngModelChange)="onFilterChange()">
          </div>

          <button class="btn btn-g" style="margin-bottom:1px" (click)="resetFilters()">
            Resetuj filtry
          </button>

          <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer;margin-bottom:1px;user-select:none">
            <input type="checkbox"
              [checked]="showArchived()"
              (change)="showArchived.set(!showArchived()); page.set(1); load()">
            Pokaż Archiwum
          </label>

        </div>
      </div>

      <!-- Pasek akcji masowych -->
      @if (someSelected()) {
        <div class="bulk-bar">
          <span class="bulk-count">{{ selectedIds().size }} zaznaczonych</span>
          <button class="btn btn-g" [disabled]="bulkActioning()" (click)="bulkSetStatus('hold')">
            ⏸ Hold
          </button>
          <button class="btn btn-g" [disabled]="bulkActioning()" (click)="bulkSetStatus('archived')">
            📦 Archiwizuj
          </button>
          <button class="btn btn-g" [disabled]="bulkActioning()" (click)="bulkSetStatus('pending')">
            ▶ Przywróć
          </button>
          <button class="btn btn-g" [disabled]="bulkActioning()" (click)="bulkReProcess()">
            🔄 Re-process
          </button>
          <span style="flex:1"></span>
          <button class="btn bulk-delete-btn" [disabled]="bulkActioning()" (click)="bulkDelete()">
            🗑 Usuń zaznaczone
          </button>
          <button class="btn btn-g" (click)="clearSelection()">✕ Anuluj</button>
        </div>
      }

      <!-- Podsumowanie -->
      <div style="font-size:13px;color:#6b7280;margin-bottom:10px">
        Wyświetlono: <b style="color:#374151">{{ total() }}</b> z <b style="color:#374151">{{ grandTotal() }}</b>
        @if (batch().running) {
          &nbsp;|&nbsp; <span style="color:var(--orange)">
            ⏳ Enrichment w toku: {{ batch().done }}/{{ batch().total }}
            (błędy: {{ batch().errors }})
          </span>
        }
      </div>

      <!-- Tabela -->
      @if (loading()) {
        <div class="loading-overlay"><div class="spinner"></div></div>
      }

      <table class="tbl">
        <thead>
          <tr>
            <th class="cb-th" (click)="$event.stopPropagation()">
              <input type="checkbox"
                [checked]="allSelected()"
                [indeterminate]="indeterminate()"
                (change)="toggleSelectAll()">
            </th>
            <th style="cursor:pointer" (click)="setSort('company_name')">
              Firma {{ sortIcon('company_name') }}
            </th>
            <th>NIP</th>
            <th style="cursor:pointer" (click)="setSort('icp_score')">
              Score {{ sortIcon('icp_score') }}
            </th>
            <th>Oddziały</th>
            <th title="Bramki: B2B + minimum 15 pracowników — obie PASS = kwalifikacja">Bramki</th>
            @for (s of signalDefs; track s.key) {
              <th class="sig-th">
                <span>{{ s.label }}</span>
                <div class="sig-info-wrap">
                  <button class="sig-info" (click)="$event.stopPropagation()">?</button>
                  <div class="sig-info-tip">
                    <div class="sig-info-tip-title">{{ s.label }}</div>
                    {{ s.desc }}
                  </div>
                </div>
              </th>
            }
            <th style="cursor:pointer" (click)="setSort('imported_at')">
              Importowano {{ sortIcon('imported_at') }}
            </th>
            <th style="cursor:pointer" (click)="setSort('enriched_at')">
              Enrichment {{ sortIcon('enriched_at') }}
            </th>
            <th>Status</th>
            <th>Akcje</th>
            <th style="width:36px"></th>
          </tr>
        </thead>
        <tbody>
          @for (p of rows(); track p.id) {
            <tr [class.expanded]="expanded() === p.id"
                [class.row-selected]="selectedIds().has(p.id)"
                style="cursor:pointer"
                (click)="toggleExpand(p.id)">
              <td class="cb-td" (click)="$event.stopPropagation()">
                <input type="checkbox"
                  [checked]="selectedIds().has(p.id)"
                  (change)="toggleSelect(p.id)">
              </td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span style="font-weight:500">{{ p.company_name || p.nip }}</span>
                  @if (p.source_database) {
                    <span class="badge badge-db">{{ p.source_database }}</span>
                  }
                  @if (p.has_partner) {
                    <button (click)="$event.stopPropagation(); goToPartner(p.partner_nav_id!, p.nip)"
                      title="Partner w CRM z tym NIP — kliknij aby przejść"
                      style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;background:#d1fae5;border:1px solid #6ee7b7;color:#065f46;cursor:pointer;font-size:10px;font-weight:700;line-height:1">
                      🤝 Partner
                    </button>
                  } @else if (p.crm_lead_id) {
                    <button (click)="$event.stopPropagation(); goToLead(p.crm_lead_id!, p.nip)"
                      title="Lead w CRM (skonwertowany prospekt) — kliknij aby przejść"
                      style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;background:#dbeafe;border:1px solid #93c5fd;color:#1d4ed8;cursor:pointer;font-size:10px;font-weight:700;line-height:1">
                      🏷 Lead
                    </button>
                  } @else if (p.has_lead) {
                    <button (click)="$event.stopPropagation(); goToLead(p.lead_id!, p.nip)"
                      title="Lead w CRM z tym NIP — kliknij aby przejść"
                      style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:4px;background:#dbeafe;border:1px solid #93c5fd;color:#1d4ed8;cursor:pointer;font-size:10px;font-weight:700;line-height:1">
                      🏷 Lead
                    </button>
                  }
                </div>
                @if (p.legal_form) {
                  <div style="font-size:11px;color:#9ca3af">{{ p.legal_form }}</div>
                }
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px">
                  @if (p.website_url) {
                    <span style="display:inline-flex;align-items:center;gap:2px">
                      <a [href]="p.website_url" target="_blank"
                        style="font-size:11px;color:var(--orange);text-decoration:none" (click)="$event.stopPropagation()">
                        🌐 {{ shortUrl(p.website_url) }}
                      </a>
                      @if (p.website_status === 'ok') {
                        <span style="font-size:10px;color:#16a34a;font-weight:700;line-height:1" title="Dane ze strony pobrane">✓</span>
                      } @else if (p.website_status === 'blocked') {
                        <span style="font-size:10px;color:#d97706;font-weight:700;line-height:1" title="Strona zablokowana przez Cloudflare/WAF — treść niedostępna dla botów">!</span>
                      } @else if (p.website_status === 'failed') {
                        <span style="font-size:10px;color:#d97706;font-weight:700;line-height:1" title="Strona niedostępna lub błąd scrapingu">!</span>
                      } @else if (p.website_status === 'not_found') {
                        <span style="font-size:10px;color:#9ca3af;font-weight:700;line-height:1" title="Nie znaleziono strony WWW">–</span>
                      }
                    </span>
                  }
                  @if (p.facebook_url) {
                    <a [href]="p.facebook_url" target="_blank" title="Facebook"
                      style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#1877f2;color:#fff;font-size:11px;font-weight:700;text-decoration:none"
                      (click)="$event.stopPropagation()">f</a>
                  }
                  @if (p.linkedin_url) {
                    <a [href]="p.linkedin_url" target="_blank"
                      [title]="'LinkedIn' + (p.linkedin_status === 'ok' ? ' — dane pobrane' : p.linkedin_status === 'blocked' ? ' — zablokowany (bot)' : p.linkedin_status === 'not_found' ? ' — nie znaleziono' : '')"
                      [style.outline]="p.linkedin_status === 'ok' ? '2px solid #16a34a' : p.linkedin_status === 'blocked' ? '2px solid #d97706' : p.linkedin_status === 'not_found' ? '2px solid #9ca3af' : 'none'"
                      style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#0a66c2;color:#fff;font-size:10px;font-weight:700;text-decoration:none"
                      (click)="$event.stopPropagation()">in</a>
                  }
                </div>
              </td>
              <td style="font-family:monospace;font-size:12px">{{ p.nip }}</td>
              <td>
                @if (p.icp_score != null) {
                  <div style="display:flex;align-items:center;gap:6px">
                    <div style="width:44px;height:6px;border-radius:3px;background:#e5e7eb;overflow:hidden">
                      <div [style.width.%]="p.icp_score"
                        [style.background]="scoreColor(p.icp_score)"
                        style="height:100%"></div>
                    </div>
                    <b [style.color]="scoreColor(p.icp_score)">
                      {{ p.icp_score }}
                    </b>
                  </div>
                } @else {
                  <span style="color:#d1d5db">—</span>
                }
              </td>
              <td style="font-size:12px">
                @if (p.branches_count != null) {
                  {{ p.branches_count }}
                  <span style="color:#9ca3af">({{ p.branches_scope }})</span>
                } @else { <span style="color:#d1d5db">—</span> }
              </td>
              <td>
                @if (p.icp_gate_status) {
                  <span class="scope-badge" [class]="'gate-' + p.icp_gate_status"
                    [title]="gateStatusLabel(p.icp_gate_status)">
                    {{ gateStatusIcon(p.icp_gate_status) }}
                  </span>
                } @else {
                  <span style="color:#d1d5db;font-size:12px">—</span>
                }
              </td>
              @for (s of signalDefs; track s.key) {
                <td class="sig-cell" [title]="signalTooltip(p, s.key, s.desc)">
                  <span class="sig-dot"
                    [class.sig-yes]="getSignal(p, s.key) === true"
                    [class.sig-no]="getSignal(p, s.key) === false">
                  </span>
                </td>
              }
              <td style="font-size:12px;white-space:nowrap">
                {{ p.imported_at | date:'dd.MM.yyyy' }}
              </td>
              <td style="font-size:12px;white-space:nowrap">
                @if (p.enriched_at) {
                  {{ p.enriched_at | date:'dd.MM.yyyy' }}
                } @else { <span style="color:#d1d5db">—</span> }
              </td>
              <td>
                @if (processingIds().has(p.id)) {
                  <span class="row-spin" title="Przetwarzanie…"></span>
                } @else {
                  <span class="badge" [class]="statusClass(p.enrichment_status)">
                    {{ statusLabel(p.enrichment_status) }}
                  </span>
                }
              </td>
              <td (click)="$event.stopPropagation()">
                @if (p.has_partner) {
                  <button class="btn btn-g" style="font-size:11px;padding:3px 8px;background:#d1fae5;color:#065f46;border-color:#6ee7b7"
                    (click)="goToPartner(p.partner_nav_id!, p.nip)"
                    title="Partner z tym NIP już istnieje w CRM — kliknij aby przejść">
                    ↗ Partner
                  </button>
                } @else if (p.crm_lead_id) {
                  <button class="btn btn-g" style="font-size:11px;padding:3px 8px"
                    (click)="goToLead(p.crm_lead_id!, p.nip)"
                    title="Przejdź do leadu CRM">
                    ↗ CRM
                  </button>
                } @else if (p.has_lead) {
                  <button class="btn btn-g" style="font-size:11px;padding:3px 8px;background:#dbeafe;color:#1d4ed8;border-color:#93c5fd"
                    (click)="goToLead(p.lead_id!, p.nip)"
                    title="Lead z tym NIP już istnieje w CRM — kliknij aby przejść">
                    ↗ Lead
                  </button>
                } @else {
                  <button class="btn btn-p" style="font-size:11px;padding:3px 8px"
                    [disabled]="toLeadLoading() === p.id || !qualifiesForLead(p)"
                    [style.opacity]="qualifiesForLead(p) ? '1' : '0.4'"
                    (click)="toLead(p)"
                    [title]="leadButtonTooltip(p)">
                    @if (toLeadLoading() === p.id) { … } @else { → Lead }
                  </button>
                }
              </td>
              <!-- Menu ⋮ -->
              <td style="text-align:center;padding:4px 6px" (click)="$event.stopPropagation()">
                <button class="btn-menu"
                  [class.btn-menu-active]="openMenu() === p.id"
                  [disabled]="statusActioning() === p.id"
                  (click)="openMenuFor($event, p.id)"
                  title="Akcje">
                  @if (statusActioning() === p.id) { ⏳ } @else { ⋮ }
                </button>
              </td>
            </tr>

            <!-- Rozwinięty wiersz ze szczegółami -->
            @if (expanded() === p.id) {
              <tr class="detail-row">
                <td colspan="17" style="background:#fafafa;padding:14px 20px">

                  <!-- NOTATKA WALIDACYJNA -->
                  <div style="margin-bottom:14px;padding:10px 14px;background:white;border:1px solid #e5e7eb;border-radius:8px"
                       (click)="$event.stopPropagation()">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                      <span style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">Notatka walidacyjna</span>
                      @if (p.note_author) {
                        <span style="font-size:11px;color:#9ca3af">
                          {{ p.note_author }} · {{ p.note_updated_at | date:'dd.MM.yyyy HH:mm' }}
                        </span>
                      }
                    </div>
                    <textarea
                      [value]="noteEdits.get(p.id) ?? (p.note ?? '')"
                      (input)="onNoteInput(p.id, $any($event.target).value)"
                      (blur)="saveNote(p)"
                      maxlength="500"
                      rows="3"
                      placeholder="Dodaj notatkę…"
                      style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;line-height:1.5;resize:vertical;color:#374151;font-family:inherit;outline:none"
                      onfocus="this.style.borderColor='#3BAA5D'"
                      onblur="this.style.borderColor='#d1d5db'"
                    ></textarea>
                    <div style="text-align:right;font-size:11px;color:#9ca3af;margin-top:2px">
                      {{ (noteEdits.get(p.id) ?? (p.note ?? '')).length }} / 500
                    </div>
                  </div>

                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

                    <!-- Lewa kolumna: AI summary + sygnały + meta -->
                    <div>
                      @if (p.ai_summary) {
                        <div style="margin-bottom:12px">
                          <div class="detail-label">Podsumowanie AI</div>
                          <div style="font-size:13px;line-height:1.5">{{ p.ai_summary }}</div>
                        </div>
                      }
                      @if (p.icp_signals?.length) {
                        <div style="margin-bottom:12px">
                          <div class="detail-label">Sygnały ICP</div>
                          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
                            @for (s of signalDefs; track s.key) {
                              <span [title]="s.desc" style="display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:2px 8px;border-radius:12px;border:1px solid"
                                [style.background]="getSignal(p, s.key) === true ? '#bbf7d0' : getSignal(p, s.key) === false ? '#fee2e2' : '#f3f4f6'"
                                [style.borderColor]="getSignal(p, s.key) === true ? '#4ade80' : getSignal(p, s.key) === false ? '#fca5a5' : '#d1d5db'"
                                [style.color]="getSignal(p, s.key) === true ? '#166534' : getSignal(p, s.key) === false ? '#991b1b' : '#6b7280'">
                                {{ getSignal(p, s.key) === true ? '✓' : getSignal(p, s.key) === false ? '✗' : '—' }}
                                {{ s.label }}
                              </span>
                            }
                          </div>
                        </div>
                      }
                      <div style="font-size:12px;display:flex;flex-direction:column;gap:5px">
                        @if (p.industry) {
                          <div><b>Branża:</b> {{ p.industry }}</div>
                        }
                        @if (p.city || p.voivodeship) {
                          <div><b>Lokalizacja:</b> {{ p.city }}{{ p.city && p.voivodeship ? ', woj. ' : '' }}{{ p.voivodeship }}</div>
                        }
                        @if (p.employment_count) {
                          <div><b>Zatrudnienie:</b> {{ p.employment_count | number }} os.</div>
                        } @else if (p.employment_range) {
                          <div><b>Zatrudnienie:</b> {{ p.employment_range }}</div>
                        }
                        @if (p.company_size) {
                          <div><b>Wielkość:</b> {{ p.company_size }}</div>
                        }
                        @if (p.krs_number) {
                          <div><b>KRS:</b> {{ p.krs_number }}</div>
                        }
                        @if (p.pkd_id) {
                          <div><b>PKD (import):</b> {{ p.pkd_id }}{{ p.pkd_description ? ' — ' + p.pkd_description : '' }}</div>
                        }
                        @if (p.enrichment_log?.gus?.found && p.enrichment_log?.gus?.pkd_codes?.length) {
                          <div>
                            <b>PKD (GUS):</b>
                            @for (code of (p.enrichment_log?.gus?.pkd_codes ?? []); track code) {
                              <span style="display:inline-block;margin:1px 3px 1px 0;padding:0 5px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:3px;font-size:11px;font-family:monospace">{{ code }}</span>
                            }
                          </div>
                        }
                        @if (p.icp_gate_status) {
                          <div><b>Bramki:</b> {{ gateStatusLabel(p.icp_gate_status) }}
                            @if (p.icp_gates) {
                              <span style="color:#9ca3af"> (B2B: {{ p.icp_gates.b2b }}, wielkość: {{ p.icp_gates.company_size }})</span>
                            }
                          </div>
                        }
                        @if (p.icp_downgrade_flags?.length) {
                          <div><b>Obniżony priorytet:</b>
                            {{ p.icp_downgrade_flags!.map(f => f.label).join(', ') }}
                          </div>
                        }
                        @if (p.icp_bonus_signals?.length) {
                          <div><b>Bonus:</b>
                            {{ p.icp_bonus_signals!.filter(b => b.hit).map(b => b.label).join(', ') || 'brak' }}
                          </div>
                        }
                        @if (p.website_url) {
                          <div style="display:flex;align-items:center;gap:8px">
                            <a [href]="p.website_url" target="_blank" (click)="$event.stopPropagation()"
                              style="color:var(--orange);text-decoration:none;font-size:12px">
                              🌐 {{ p.website_url }}
                            </a>
                            @if (p.website_status === 'ok') {
                              <span style="font-size:10px;font-weight:600;color:#16a34a;white-space:nowrap"
                                title="Dane ze strony pobrane pomyślnie">✓ pobrano</span>
                            } @else if (p.website_status === 'blocked') {
                              <span style="font-size:10px;font-weight:600;color:#d97706;white-space:nowrap"
                                title="Strona zablokowana przez Cloudflare/WAF — treść niedostępna dla botów, enrichment kontynuowany z danych KRS">⚠ Cloudflare</span>
                            } @else if (p.website_status === 'failed') {
                              <span style="font-size:10px;font-weight:600;color:#d97706;white-space:nowrap"
                                title="Strona niedostępna lub pusty wynik scrapingu">⚠ brak treści</span>
                            } @else if (p.website_status === 'not_found') {
                              <span style="font-size:10px;font-weight:600;color:#9ca3af;white-space:nowrap"
                                title="Nie znaleziono adresu strony WWW">✗ nie znaleziono</span>
                            }
                          </div>
                        }
                        @if (p.facebook_url) {
                          <div>
                            <a [href]="p.facebook_url" target="_blank" (click)="$event.stopPropagation()"
                              style="color:#1877f2;text-decoration:none;font-size:12px">
                              <b>f</b> {{ p.facebook_url }}
                            </a>
                          </div>
                        }
                        @if (p.linkedin_url) {
                          <div style="display:flex;align-items:center;gap:8px">
                            <a [href]="p.linkedin_url" target="_blank" (click)="$event.stopPropagation()"
                              style="color:#0a66c2;text-decoration:none;font-size:12px">
                              <b>in</b> {{ p.linkedin_url }}
                            </a>
                            @if (p.linkedin_status === 'ok') {
                              <span style="font-size:10px;font-weight:600;color:#16a34a;white-space:nowrap"
                                title="Dane LinkedIn pobrane pomyślnie">✓ pobrano</span>
                            } @else if (p.linkedin_status === 'blocked') {
                              <span style="font-size:10px;font-weight:600;color:#d97706;white-space:nowrap"
                                title="LinkedIn zwrócił HTTP 999 bez treści — robot zablokowany">⚠ zablokowany</span>
                            } @else if (p.linkedin_status === 'not_found') {
                              <span style="font-size:10px;font-weight:600;color:#9ca3af;white-space:nowrap"
                                title="Nie znaleziono strony LinkedIn">✗ nie znaleziono</span>
                            }
                          </div>
                        }
                        @if (p.enrichment_status === 'no_website') {
                          <div style="color:#92400e;background:#fef3c7;padding:5px 8px;border-radius:5px;margin-top:4px;font-size:11px">
                            ⚠ Nie znaleziono strony WWW — enrichment wstrzymany.
                            Użyj opcji Re-process i podaj adres strony ręcznie.
                          </div>
                        }
                        @if (p.enrichment_error) {
                          <div style="color:#dc2626;margin-top:4px">
                            <b>Błąd enrichmentu:</b> {{ p.enrichment_error }}
                          </div>
                        }
                      </div>
                    </div>

                    <!-- Prawa kolumna: kluczowe kontakty + osoba decyzyjna z pliku -->
                    <div>
                      @if (p.decision_maker_name) {
                        <div style="margin-bottom:10px">
                          <div class="detail-label">Osoba decyzyjna (z pliku importu)</div>
                          <div style="border:1px solid #fbd0b6;border-radius:6px;padding:8px 10px;background:#fff7ed;font-size:12px">
                            <div style="font-weight:600">{{ p.decision_maker_name }}</div>
                            @if (p.decision_maker_title) {
                              <div style="color:#6b7280">{{ p.decision_maker_title }}{{ p.decision_maker_dept ? ' · ' + p.decision_maker_dept : '' }}</div>
                            }
                            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
                              @if (p.decision_maker_email) {
                                <a [href]="'mailto:' + p.decision_maker_email"
                                  style="color:var(--orange);text-decoration:none"
                                  (click)="$event.stopPropagation()">
                                  ✉ {{ p.decision_maker_email }}
                                </a>
                              }
                              @if (p.decision_maker_phone) {
                                <span style="color:#374151;font-size:12px">📞 {{ p.decision_maker_phone }}</span>
                              }
                              @if (p.decision_maker_linkedin) {
                                <a [href]="p.decision_maker_linkedin" target="_blank"
                                  style="color:#0a66c2;text-decoration:none;font-weight:600"
                                  (click)="$event.stopPropagation()">
                                  in LI
                                </a>
                              }
                              @if (p.decision_maker_facebook) {
                                <a [href]="p.decision_maker_facebook" target="_blank"
                                  style="color:#1877f2;text-decoration:none;font-weight:600"
                                  (click)="$event.stopPropagation()">
                                  f FB
                                </a>
                              }
                            </div>
                          </div>
                        </div>
                      }
                      @if (p.key_contacts?.length) {
                        <div class="detail-label">Kluczowe kontakty — znalezione przez AI ({{ p.key_contacts!.length }})</div>
                        <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
                          @for (c of p.key_contacts!; track $index) {
                            <div style="border:1px solid #e5e7eb;border-radius:6px;
                                        padding:8px 10px;background:#fff;font-size:12px">
                              @if (c.name) {
                                <div style="font-weight:600;margin-bottom:2px">{{ c.name }}</div>
                              }
                              @if (c.title) {
                                <div style="color:#6b7280;margin-bottom:4px">{{ c.title }}</div>
                              }
                              <div style="display:flex;flex-wrap:wrap;gap:8px">
                                @if (c.email) {
                                  <a [href]="'mailto:' + c.email"
                                    style="color:var(--orange);text-decoration:none"
                                    (click)="$event.stopPropagation()">
                                    ✉ {{ c.email }}
                                  </a>
                                }
                                @if (c.phone) {
                                  <a [href]="'tel:' + c.phone"
                                    style="color:#374151;text-decoration:none"
                                    (click)="$event.stopPropagation()">
                                    📞 {{ c.phone }}
                                  </a>
                                }
                              </div>
                            </div>
                          }
                        </div>
                      } @else if (p.enrichment_status === 'done') {
                        <div style="font-size:12px;color:#9ca3af;padding-top:4px">
                          Nie znaleziono kluczowych kontaktów na stronie WWW.
                        </div>
                      }
                    </div>

                  </div>

                  <!-- Log enrichmentu — pełna szerokość -->
                  @if (p.enrichment_log) {
                    <div class="enrich-log">
                      <div class="detail-label" style="margin-bottom:10px">
                        Log enrichmentu
                        <span style="font-weight:400;color:#9ca3af;margin-left:8px;text-transform:none;letter-spacing:0">
                          {{ p.enrichment_log.timestamp | date:'dd.MM.yyyy HH:mm' }}
                        </span>
                      </div>

                      <div class="log-steps">

                        <!-- GUS -->
                        @if (p.enrichment_log?.gus !== undefined) {
                          <div class="log-step">
                            <div class="log-badge" [class.log-badge-ok]="p.enrichment_log?.gus?.found"
                                 [class.log-badge-err]="!p.enrichment_log?.gus?.found">GUS</div>
                            <div class="log-step-body">
                              @if (p.enrichment_log?.gus?.found) {
                                <span class="log-ok">✓ REGON {{ p.enrichment_log?.gus?.regon }}</span>
                                @if (p.enrichment_log?.gus?.pkd_main) {
                                  <span class="log-detail"> · PKD {{ p.enrichment_log?.gus?.pkd_main }}</span>
                                }
                                @if ((p.enrichment_log?.gus?.pkd_codes?.length ?? 0) > 1) {
                                  @if (expandedGusIds().has(p.id)) {
                                    <span style="display:inline-flex;flex-wrap:wrap;gap:2px;margin-left:4px;vertical-align:middle">
                                      @for (code of (p.enrichment_log?.gus?.pkd_codes ?? []); track code) {
                                        <span style="padding:0 4px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:3px;font-size:10px;font-family:monospace">{{ code }}</span>
                                      }
                                    </span>
                                    <button class="log-expand-btn" (click)="toggleGusExpand(p.id, $event)">zwiń</button>
                                  } @else {
                                    <button class="log-expand-btn" (click)="toggleGusExpand(p.id, $event)">(+{{ (p.enrichment_log?.gus?.pkd_codes?.length ?? 1) - 1 }} więcej)</button>
                                  }
                                }
                              } @else {
                                <span class="log-err">✗ Nie znaleziono w GUS REGON</span>
                                @if (p.enrichment_log?.gus?.error) {
                                  <span class="log-muted"> — {{ p.enrichment_log?.gus?.error }}</span>
                                }
                              }
                            </div>
                          </div>
                        }

                        <!-- KRS -->
                        <div class="log-step">
                          <div class="log-badge" [class.log-badge-ok]="p.enrichment_log.krs?.found"
                               [class.log-badge-err]="!p.enrichment_log.krs?.found">KRS</div>
                          <div class="log-step-body">
                            @if (p.enrichment_log.krs?.found) {
                              <span class="log-ok">✓ Znaleziono</span>
                              @if (p.enrichment_log.krs!.legal_form) {
                                <span class="log-detail"> — {{ p.enrichment_log.krs!.legal_form }}</span>
                              }
                              @if (p.enrichment_log.krs!.branches_count) {
                                <span class="log-detail"> · {{ p.enrichment_log.krs!.branches_count }} oddziałów ({{ p.enrichment_log.krs!.branches_scope }})</span>
                              }
                              @if (!p.enrichment_log.krs!.had_website) {
                                <span class="log-muted"> · brak URL strony w rejestrze</span>
                              }
                            } @else {
                              <span class="log-err">✗ Nie znaleziono w KRS</span>
                            }
                          </div>
                        </div>

                        <!-- Website -->
                        <div class="log-step">
                          <div class="log-badge" [class.log-badge-ok]="p.enrichment_log.website?.url"
                               [class.log-badge-err]="!p.enrichment_log.website?.url">WWW</div>
                          <div class="log-step-body">
                            @if (p.enrichment_log.website?.url) {
                              <a [href]="p.enrichment_log.website!.url!" target="_blank"
                                 class="log-ok" style="text-decoration:none"
                                 (click)="$event.stopPropagation()">
                                ✓ {{ p.enrichment_log.website!.url }}
                              </a>
                              <span class="log-detail"> · metoda: {{ websiteMethodLabel(p.enrichment_log.website!.method) }}</span>
                              @if (p.enrichment_log.website!.pages_count) {
                                <span class="log-detail"> · {{ p.enrichment_log.website!.pages_count }} stron</span>
                              }
                              @if (p.enrichment_log.website!.chars_extracted) {
                                <span class="log-detail"> · {{ p.enrichment_log.website!.chars_extracted | number }} znaków</span>
                              }
                            } @else {
                              <span class="log-err">✗ Nie znaleziono strony WWW</span>
                              <span class="log-muted"> (metoda: {{ websiteMethodLabel(p.enrichment_log.website?.method || 'none') }})</span>
                            }
                          </div>
                        </div>

                        <!-- Claude -->
                        @if (p.enrichment_log.claude) {
                          <div class="log-step log-step-claude">
                            <div class="log-badge log-badge-ok">AI</div>
                            <div class="log-step-body" style="flex:1">
                              <span class="log-ok">✓ Claude</span>
                              <span class="log-detail"> {{ p.enrichment_log.claude.model }}</span>
                              @if (p.enrichment_log.claude.signal_reasoning) {
                                <div class="log-signals">
                                  @for (s of signalDefs; track s.key) {
                                    @if (getSignalReasoning(p, s)) {
                                      <div class="log-signal-row">
                                        <span class="sig-dot log-sig-dot"
                                          [class.sig-yes]="getSignal(p, s.key) === true"
                                          [class.sig-no]="getSignal(p, s.key) === false">
                                        </span>
                                        <span class="log-signal-key">{{ s.label }}</span>
                                        <span class="log-signal-reason">
                                          {{ getSignalReasoning(p, s) }}
                                        </span>
                                      </div>
                                    }
                                  }
                                </div>
                              }
                            </div>
                          </div>
                        }

                      </div>
                    </div>
                  }

                </td>
              </tr>
            }
          } @empty {
            <tr>
              <td colspan="16" style="text-align:center;color:#9ca3af;padding:40px">
                Brak firm. Zaimportuj plik CSV aby rozpocząć.
              </td>
            </tr>
          }
        </tbody>
      </table>

      <!-- Paginacja -->
      @if (pages() > 1) {
        <div style="display:flex;justify-content:center;gap:8px;margin-top:16px">
          <button class="btn btn-g" [disabled]="page() <= 1" (click)="setPage(page() - 1)">
            ‹ Poprzednia
          </button>
          <span style="line-height:32px;font-size:13px">
            {{ page() }} / {{ pages() }}
          </span>
          <button class="btn btn-g" [disabled]="page() >= pages()" (click)="setPage(page() + 1)">
            Następna ›
          </button>
        </div>
      }

    </div>

    <!-- Dropdown menu — position:fixed, nie jest przycinany przez overflow tabeli -->
    @if (activeMenuProspect() != null) {
      <div class="row-menu"
        [style.top.px]="menuPos()!.top"
        [style.right.px]="menuPos()!.right"
        (click)="$event.stopPropagation()">

        @if (activeMenuProspect()!.enrichment_status !== 'hold') {
          <button class="mi" (click)="setStatus(activeMenuProspect()!, 'hold'); closeMenu()">
            ⏸ Hold
          </button>
        } @else {
          <button class="mi" (click)="setStatus(activeMenuProspect()!, 'pending'); closeMenu()">
            ▶ Przywróć do kolejki
          </button>
        }

        @if (activeMenuProspect()!.enrichment_status !== 'archived') {
          <button class="mi" (click)="setStatus(activeMenuProspect()!, 'archived'); closeMenu()">
            📦 Archiwizuj
          </button>
        } @else {
          <button class="mi" (click)="setStatus(activeMenuProspect()!, 'pending'); closeMenu()">
            ▶ Przywróć z archiwum
          </button>
        }

        <button class="mi" (click)="openReprocessDialog(activeMenuProspect()!)">
          🔄 Re-process
        </button>

        @if (activeMenuProspect()!.enrichment_log) {
          <button class="mi" (click)="openInspect(activeMenuProspect()!)">
            🔍 Inspekcja
          </button>
        }

        <div class="mi-sep"></div>

        <button class="mi mi-danger" (click)="deleteProspect(activeMenuProspect()!)">
          🗑 Usuń
        </button>
      </div>
    }

    <!-- Modal: potwierdzenie NIP i wybór handlowca przed utworzeniem leada -->
    @if (toLeadDialog() != null) {
      <div class="inspect-overlay" (click)="toLeadDialog.set(null)"></div>
      <div class="inspect-modal" style="max-width:420px;padding:24px" (click)="$event.stopPropagation()">
        <div style="font-weight:600;font-size:15px;margin-bottom:4px">Utwórz lead w CRM</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px">
          {{ toLeadDialog()!.company_name || toLeadDialog()!.nip }}
        </div>

        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">
          NIP firmy — potwierdź lub popraw
        </label>
        <div style="position:relative;margin-bottom:4px">
          <input class="inp" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:14px;letter-spacing:0.05em"
            [(ngModel)]="toLeadNipValue"
            maxlength="13"
            placeholder="0000000000">
          @if (toLeadNipDigits !== toLeadDialog()!.nip) {
            <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:11px;color:#d97706;font-weight:600">
              zmieniony
            </span>
          }
        </div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:16px">
          Ten NIP zostanie użyty do wyszukania duplikatów i utworzenia leada.
          @if (toLeadNipDigits !== toLeadDialog()!.nip && toLeadNipDigits.length === 10) {
            <span style="color:#d97706"> Prospekt zostanie zaktualizowany.</span>
          }
        </div>

        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">
          Przypisz do handlowca
        </label>
        <select style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:20px"
          [ngModel]="toLeadAssignedTo()"
          (ngModelChange)="toLeadAssignedTo.set($event)">
          <option value="">— Przypisz do siebie (domyślnie) —</option>
          @for (u of salesUsers(); track u.id) {
            <option [value]="u.id">{{ u.display_name }}</option>
          }
        </select>

        <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">
          Tag (opcjonalny)
        </label>
        <input class="inp" style="width:100%;box-sizing:border-box;margin-bottom:20px"
          [(ngModel)]="toLeadTagValue"
          maxlength="50"
          placeholder="np. hot-lead, q4-2026, priorytet">

        @if (toLeadDuplicateError()) {
          <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#991b1b">
            Firma o podobnej nazwie już istnieje w CRM jako
            <strong>{{ toLeadDuplicateError()!.src === 'lead' ? 'lead' : 'partner' }}</strong>:
            „{{ toLeadDuplicateError()!.company }}"
          </div>
        }

        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button style="padding:7px 16px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px"
            (click)="toLeadDialog.set(null)">Anuluj</button>
          <button style="padding:7px 16px;border:none;border-radius:6px;background:var(--orange);color:#fff;cursor:pointer;font-size:13px;font-weight:600"
            [disabled]="toLeadNipDigits.length !== 10 || !!toLeadLoading()"
            (click)="confirmToLead()">
            {{ toLeadLoading() ? 'Tworzenie…' : toLeadDuplicateError() ? '→ Utwórz mimo to' : '→ Utwórz lead' }}
          </button>
        </div>
      </div>
    }

    <!-- Inspect modal — wizualizacja logiki enrichmentu -->
    @if (inspectTarget() != null) {
      <div class="inspect-overlay" (click)="inspectTarget.set(null)"></div>
      <div class="inspect-modal" (click)="$event.stopPropagation()">

        <div class="inspect-header">
          <div class="inspect-title">
            <span style="font-size:12px;color:#6b7280;font-weight:500">🔍 Inspekcja enrichmentu</span>
            <span class="inspect-company">{{ inspectTarget()!.company_name || inspectTarget()!.nip }}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="inspect-tabs">
              <button class="inspect-tab" [class.inspect-tab-active]="inspectView() === 'analysis'"
                (click)="inspectView.set('analysis')">Analiza</button>
              <button class="inspect-tab" [class.inspect-tab-active]="inspectView() === 'prompt'"
                (click)="switchToPrompt()">Prompt Claude</button>
            </div>
            <button class="inspect-close" (click)="inspectTarget.set(null)">✕</button>
          </div>
        </div>

        <!-- Widok: Prompt -->
        @if (inspectView() === 'prompt') {
          <div class="inspect-prompt-view">
            @if (inspectPromptLoading()) {
              <div style="display:flex;align-items:center;justify-content:center;height:100%;gap:10px;color:#9ca3af;font-size:13px">
                <span class="row-spin"></span> Wczytuję prompt…
              </div>
            } @else if (inspectPrompt()) {
              <pre class="inspect-prompt-pre">{{ inspectPrompt() }}</pre>
            }
          </div>
        }

        <!-- Widok: Analiza -->
        @if (inspectView() === 'analysis') {
        <div class="inspect-body">

          <!-- Kolumna lewa: dane wejściowe -->
          <div class="inspect-col-left">
            <div class="inspect-section-title">Dane wejściowe Claude</div>

            <!-- GUS -->
            @if (inspectTarget()!.enrichment_log!.gus !== undefined) {
              <div class="inspect-card">
                <div class="inspect-card-header">
                  <span class="inspect-badge"
                    [class.inspect-badge-ok]="inspectTarget()!.enrichment_log!.gus?.found"
                    [class.inspect-badge-err]="!inspectTarget()!.enrichment_log!.gus?.found">GUS</span>
                  <span style="font-size:12px">
                    {{ inspectTarget()!.enrichment_log!.gus?.found ? '✓ Znaleziono w REGON' : '✗ Nie znaleziono' }}
                  </span>
                </div>
                @if (inspectTarget()!.enrichment_log!.gus?.found) {
                  <div class="inspect-kv">
                    <div class="inspect-row">
                      <span class="ik">REGON</span>
                      <span class="iv" style="font-family:monospace">{{ inspectTarget()!.enrichment_log?.gus?.regon }}</span>
                    </div>
                    @if (inspectTarget()!.enrichment_log?.gus?.official_name) {
                      <div class="inspect-row">
                        <span class="ik">Nazwa oficjalna</span>
                        <span class="iv">{{ inspectTarget()!.enrichment_log?.gus?.official_name }}</span>
                      </div>
                    }
                    @if (inspectTarget()!.enrichment_log?.gus?.pkd_codes?.length) {
                      <div class="inspect-row" style="align-items:flex-start">
                        <span class="ik">Kody PKD</span>
                        <span class="iv" style="display:flex;flex-wrap:wrap;gap:3px">
                          @for (code of (inspectTarget()!.enrichment_log?.gus?.pkd_codes ?? []); track code) {
                            <span style="padding:1px 6px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:3px;font-size:10px;font-family:monospace"
                              [class.inspect-highlight]="code === inspectTarget()!.enrichment_log?.gus?.pkd_main">{{ code }}</span>
                          }
                        </span>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- KRS -->
            <div class="inspect-card">
              <div class="inspect-card-header">
                <span class="inspect-badge"
                  [class.inspect-badge-ok]="inspectTarget()!.enrichment_log!.krs?.found"
                  [class.inspect-badge-err]="!inspectTarget()!.enrichment_log!.krs?.found">KRS</span>
                <span style="font-size:12px">
                  {{ inspectTarget()!.enrichment_log!.krs?.found ? '✓ Znaleziono' : '✗ Nie znaleziono' }}
                </span>
              </div>
              @if (inspectTarget()!.enrichment_log!.krs?.found) {
                <div class="inspect-kv">
                  @if (inspectTarget()!.krs_number) {
                    <div class="inspect-row"><span class="ik">Nr KRS</span><span class="iv" style="font-family:monospace">{{ inspectTarget()!.krs_number }}</span></div>
                  }
                  @if (inspectTarget()!.legal_form) {
                    <div class="inspect-row"><span class="ik">Forma prawna</span><span class="iv">{{ inspectTarget()!.legal_form }}</span></div>
                  }
                  @if (inspectTarget()!.enrichment_log!.krs!.branches_count != null) {
                    <div class="inspect-row">
                      <span class="ik">Oddziały KRS</span>
                      <span class="iv inspect-highlight">{{ inspectTarget()!.enrichment_log!.krs!.branches_count }} ({{ inspectTarget()!.enrichment_log!.krs!.branches_scope }})</span>
                    </div>
                  }
                  <div class="inspect-row">
                    <span class="ik">URL w KRS</span>
                    <span class="iv" [class.inspect-muted]="!inspectTarget()!.enrichment_log!.krs!.had_website">
                      {{ inspectTarget()!.enrichment_log!.krs!.had_website ? '✓ był' : 'brak' }}
                    </span>
                  </div>
                </div>
              }
            </div>

            <!-- Website -->
            <div class="inspect-card">
              <div class="inspect-card-header">
                <span class="inspect-badge"
                  [class.inspect-badge-ok]="inspectTarget()!.enrichment_log!.website?.url"
                  [class.inspect-badge-err]="!inspectTarget()!.enrichment_log!.website?.url">WWW</span>
                <span style="font-size:12px">
                  {{ inspectTarget()!.enrichment_log!.website?.url ? '✓ Znaleziono' : '✗ Brak strony' }}
                </span>
              </div>
              <div class="inspect-kv">
                @if (inspectTarget()!.enrichment_log!.website?.url) {
                  <div class="inspect-row">
                    <span class="ik">URL</span>
                    <a [href]="inspectTarget()!.enrichment_log!.website!.url!" target="_blank"
                       class="iv inspect-link" (click)="$event.stopPropagation()">
                      {{ inspectTarget()!.enrichment_log!.website!.url }}
                    </a>
                  </div>
                }
                <div class="inspect-row">
                  <span class="ik">Metoda</span>
                  <span class="iv">{{ websiteMethodLabel(inspectTarget()!.enrichment_log!.website?.method || 'none') }}</span>
                </div>
                @if (inspectTarget()!.enrichment_log!.website?.pages_count) {
                  <div class="inspect-row">
                    <span class="ik">Stron</span>
                    <span class="iv inspect-highlight">{{ inspectTarget()!.enrichment_log!.website!.pages_count }}</span>
                  </div>
                }
                @if (inspectTarget()!.enrichment_log!.website?.chars_extracted) {
                  <div class="inspect-row">
                    <span class="ik">Znaków</span>
                    <span class="iv">{{ inspectTarget()!.enrichment_log!.website!.chars_extracted! | number }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Model AI -->
            @if (inspectTarget()!.enrichment_log!.claude) {
              <div class="inspect-card" style="background:#f0f9ff;border-color:#bae6fd">
                <div class="inspect-card-header">
                  <span class="inspect-badge" style="background:#e0e7ff;color:#3730a3">AI</span>
                  <span style="font-size:12px">Claude</span>
                </div>
                <div class="inspect-kv">
                  <div class="inspect-row">
                    <span class="ik">Model</span>
                    <span class="iv" style="font-family:monospace;font-size:10px">{{ inspectTarget()!.enrichment_log!.claude!.model }}</span>
                  </div>
                  <div class="inspect-row">
                    <span class="ik">Bramki</span>
                    <span class="iv">{{ gateStatusLabel(inspectTarget()!.enrichment_log!.claude!.gate_status || '') }}</span>
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- Kolumna prawa: sygnały + scoring -->
          <div class="inspect-col-right">

            <div class="inspect-section-title">Sygnały i uzasadnienie Claude</div>
            <div class="inspect-signals">
              @for (s of signalDefs; track s.key) {
                <div class="inspect-signal-row"
                  [class.inspect-signal-true]="getSignal(inspectTarget()!, s.key) === true"
                  [class.inspect-signal-false]="getSignal(inspectTarget()!, s.key) === false">
                  <span class="inspect-sig-dot sig-dot"
                    [class.sig-yes]="getSignal(inspectTarget()!, s.key) === true"
                    [class.sig-no]="getSignal(inspectTarget()!, s.key) === false">
                  </span>
                  <div class="inspect-signal-body">
                    <div class="inspect-signal-name">{{ s.label }}</div>
                    @if (getSignalReasoning(inspectTarget()!, s)) {
                      <div class="inspect-signal-reason">{{ getSignalReasoning(inspectTarget()!, s) }}</div>
                    } @else {
                      <div class="inspect-signal-reason inspect-muted">brak uzasadnienia</div>
                    }
                  </div>
                  <code class="inspect-signal-val">{{ getSignal(inspectTarget()!, s.key) === true ? 'true' : getSignal(inspectTarget()!, s.key) === false ? 'false' : 'null' }}</code>
                </div>
              }
            </div>

            <!-- Kalkulacja score -->
            <div class="inspect-section-title" style="margin-top:18px">Kalkulacja score</div>
            @if (inspectScoreBreakdown(); as sb) {
              <div class="inspect-score-breakdown">
                <div class="sb-row">
                  <span class="sb-label">Aktywne sygnały (true)</span>
                  <span class="sb-value">{{ sb.trueCount }} / 8</span>
                </div>
                <div class="sb-row" style="background:#f9fafb">
                  <span class="sb-label">Bramki (B2B / wielkość firmy)</span>
                  <span class="sb-value" style="color:#374151">{{ sb.gates.b2b }} / {{ sb.gates.company_size }} → {{ gateStatusLabel(sb.gateStatus) }}</span>
                </div>
                <div class="sb-row">
                  <span class="sb-label">Suma sygnałów ({{ sb.trueCount }}/8 true, wagi 10/5)</span>
                  <span class="sb-value sb-plus">{{ sb.raw }}</span>
                </div>
                @for (b of sb.bonusBreakdown; track b.id) {
                  @if (b.hit) {
                    <div class="sb-row">
                      <span class="sb-label">Bonus: {{ b.label }}</span>
                      <span class="sb-value sb-plus">+{{ b.points }}</span>
                    </div>
                  }
                }
                @for (f of sb.downgradeFlags; track f.id) {
                  @if (f.points) {
                    <div class="sb-row">
                      <span class="sb-label">{{ f.label }}</span>
                      <span class="sb-value sb-minus">{{ f.points }}</span>
                    </div>
                  }
                }
                <div class="sb-row sb-total">
                  <span class="sb-label">Wynik obliczony</span>
                  <span class="sb-value">= {{ sb.total }}</span>
                </div>
              </div>
            }

          </div>
        </div>

        <!-- Footer: AI summary + kontakty + lokalizacje -->
        <div class="inspect-footer">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

            @if (inspectTarget()!.ai_summary) {
              <div>
                <div class="inspect-section-title" style="margin-bottom:5px">Podsumowanie AI</div>
                <div style="font-size:12px;line-height:1.6;color:#374151">{{ inspectTarget()!.ai_summary }}</div>
              </div>
            }

          </div>

          @if (inspectTarget()!.key_contacts?.length) {
            <div style="margin-top:12px">
              <div class="inspect-section-title" style="margin-bottom:6px">
                Kluczowe kontakty ({{ inspectTarget()!.key_contacts!.length }})
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                @for (c of inspectTarget()!.key_contacts!; track $index) {
                  <div class="inspect-contact-card">
                    @if (c.name) { <div style="font-weight:600;font-size:12px;color:#111827;margin-bottom:1px">{{ c.name }}</div> }
                    @if (c.title) { <div style="font-size:11px;color:#6b7280;margin-bottom:5px">{{ c.title }}</div> }
                    <div style="display:flex;flex-direction:column;gap:2px">
                      @if (c.email) {
                        <a [href]="'mailto:' + c.email" style="color:var(--orange);text-decoration:none;font-size:11px" (click)="$event.stopPropagation()">✉ {{ c.email }}</a>
                      }
                      @if (c.phone) {
                        <span style="color:#374151;font-size:11px">📞 {{ c.phone }}</span>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        } <!-- /inspectView === 'analysis' -->

      </div>
    }

    <!-- Re-process dialog — edycja pól przed przetworzeniem -->
    @if (reprocessTarget() != null) {
      <div class="reprocess-overlay" (click)="reprocessTarget.set(null)"></div>
      <div class="reprocess-dialog" (click)="$event.stopPropagation()">
        <div class="reprocess-dialog-title">
          Re-process: {{ reprocessTarget()!.company_name || reprocessTarget()!.nip }}
        </div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:14px">
          Pola są opcjonalne — wypełnij tylko te, które chcesz poprawić lub uzupełnić.
        </div>

        <label style="font-size:12px;font-weight:500;color:#374151;display:block;margin-bottom:4px">
          NIP <span style="font-weight:400;color:#6b7280">(zostaw puste jeśli poprawny)</span>
        </label>
        <input class="inp" style="width:100%;box-sizing:border-box;margin-bottom:12px"
          [(ngModel)]="reprocessNipValue"
          placeholder="{{ reprocessTarget()!.nip }}"
          maxlength="12">

        <label style="font-size:12px;font-weight:500;color:#374151;display:flex;align-items:center;gap:8px;margin-bottom:4px">
          Strona WWW
          @if (reprocessTarget()?.website_status === 'ok') {
            <span style="font-size:10px;font-weight:600;color:#16a34a">✓ pobrano</span>
          } @else if (reprocessTarget()?.website_status === 'blocked') {
            <span style="font-size:10px;font-weight:600;color:#d97706" title="Strona zablokowana przez Cloudflare/WAF">⚠ Cloudflare</span>
          } @else if (reprocessTarget()?.website_status === 'failed') {
            <span style="font-size:10px;font-weight:600;color:#d97706">⚠ brak treści</span>
          } @else if (reprocessTarget()?.website_status === 'not_found') {
            <span style="font-size:10px;font-weight:600;color:#9ca3af">✗ nie znaleziono</span>
          }
        </label>
        <input class="inp" style="width:100%;box-sizing:border-box;margin-bottom:12px"
          [(ngModel)]="reprocessUrlValue"
          placeholder="https://www.firma.pl">

        <label style="font-size:12px;font-weight:500;color:#374151;display:flex;align-items:center;gap:8px;margin-bottom:4px">
          LinkedIn
          @if (reprocessTarget()?.linkedin_status === 'ok') {
            <span style="font-size:10px;font-weight:600;color:#16a34a">✓ pobrano</span>
          } @else if (reprocessTarget()?.linkedin_status === 'blocked') {
            <span style="font-size:10px;font-weight:600;color:#d97706">⚠ zablokowany</span>
          } @else if (reprocessTarget()?.linkedin_status === 'not_found') {
            <span style="font-size:10px;font-weight:600;color:#9ca3af">✗ nie znaleziono</span>
          }
        </label>
        <input class="inp" style="width:100%;box-sizing:border-box;margin-bottom:10px"
          [(ngModel)]="reprocessLinkedinValue"
          placeholder="https://www.linkedin.com/company/nazwa">

        <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;cursor:pointer">
          <input type="checkbox" [(ngModel)]="reprocessDoLinkedin"
            style="width:14px;height:14px;accent-color:#3BAA5D;cursor:pointer">
          <span style="font-size:12px;color:#374151">
            Analizuj LinkedIn podczas przetwarzania
            <span style="color:#6b7280">(próba scrapingu strony firmy)</span>
          </span>
        </label>

        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-g" (click)="reprocessTarget.set(null)">Anuluj</button>
          <button class="btn btn-p" (click)="confirmReprocess()">🔄 Przetwórz</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; overflow:hidden; }

    .reprocess-overlay {
      position:fixed; inset:0; z-index:2000; background:rgba(0,0,0,0.35);
    }
    .reprocess-dialog {
      position:fixed; z-index:2001;
      top:50%; left:50%; transform:translate(-50%,-50%);
      background:#fff; border-radius:10px; padding:24px;
      width:400px; max-width:calc(100vw - 32px);
      box-shadow:0 8px 32px rgba(0,0,0,0.22);
    }
    .reprocess-dialog-title {
      font-weight:600; font-size:14px; color:#111827;
      margin-bottom:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }

    #topbar {
      height:60px; background:white; border-bottom:1px solid var(--gray-200);
      display:flex; align-items:center; gap:12px; padding:0 24px; flex-shrink:0;
    }

    #content {
      flex:1; overflow-y:auto; overflow-x:auto;
      padding:20px 24px 32px; display:flex; flex-direction:column; gap:0;
    }

    .fld { display:flex; flex-direction:column; gap:3px; }
    .fld label { font-size:11px; font-weight:500; color:#6b7280; }
    .inp { height:32px; border:1px solid #d1d5db; border-radius:6px;
           padding:0 8px; font-size:13px; background:#fff; }
    .inp:focus { outline:none; border-color:var(--orange); }

    /* Pasek akcji masowych */
    .bulk-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 14px; margin-bottom: 10px;
      background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
      font-size: 13px;
    }
    .bulk-count { font-weight: 600; color: #1d4ed8; margin-right: 4px; white-space: nowrap; }
    .bulk-delete-btn { color: #991b1b !important; border-color: #fca5a5 !important; }
    .bulk-delete-btn:hover:not(:disabled) { background: #fee2e2 !important; }

    .tbl { width:100%; border-collapse:collapse; font-size:13px; }
    .tbl th {
      background:#f9fafb; text-align:left; padding:8px 10px 14px;
      border-bottom:1px solid #e5e7eb; font-size:11px;
      font-weight:600; color:#6b7280; white-space:nowrap; position:sticky; top:0; z-index:1;
      vertical-align:bottom;
    }
    .tbl td { padding:8px 10px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
    .tbl tr:hover td { background:#fafafa; }
    .tbl tr.expanded td { background:#f0f9ff; }
    .tbl tr.row-selected td { background:#eff6ff !important; }
    .tbl tr.row-selected:hover td { background:#dbeafe !important; }
    .tbl tr.detail-row td { background:#fafafa !important; }
    .tbl tr.detail-row:hover td { background:#fafafa !important; }

    /* Kolumna checkbox */
    .cb-th { width: 36px; min-width: 36px; max-width: 36px; text-align: center; padding: 8px 4px 14px !important; vertical-align: bottom; }
    .cb-td { width: 36px; padding: 8px 4px !important; text-align: center; vertical-align: middle; }
    .cb-th input, .cb-td input { cursor: pointer; accent-color: var(--orange); }

    /* Nagłówki sygnałów — tekst pionowy */
    .sig-th {
      width: 28px; min-width: 28px; max-width: 28px;
      height: 80px;
      padding: 4px 0 4px 0 !important;
      vertical-align: bottom;
      text-align: center;
      white-space: nowrap;
      overflow: visible;
      position: relative;
    }
    .sig-th > span {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      cursor: default;
      letter-spacing: 0.3px;
    }

    /* Tooltip "?" dla sygnałów */
    .sig-info-wrap {
      position: relative;
      display: flex;
      justify-content: center;
      margin-top: 5px;
    }
    .sig-info {
      width: 15px; height: 15px;
      border-radius: 50%;
      border: 1px solid #d1d5db;
      background: #f9fafb;
      color: #9ca3af;
      font-size: 9px; font-weight: 700;
      cursor: help;
      display: flex; align-items: center; justify-content: center;
      padding: 0; line-height: 1;
    }
    .sig-info:hover { background: #f0f9ff; border-color: var(--orange); color: var(--orange); }
    .sig-info-tip {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: #1f2937;
      color: #f9fafb;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 12px;
      min-width: 220px;
      max-width: 280px;
      z-index: 9999;
      line-height: 1.5;
      white-space: normal;
      writing-mode: horizontal-tb;
      text-align: left;
      font-weight: normal;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      pointer-events: none;
    }
    .sig-info-tip-title {
      font-weight: 700;
      margin-bottom: 5px;
      color: #fff;
      font-size: 13px;
    }
    .sig-info-wrap:hover .sig-info-tip { display: block; }

    /* Komórki matrycy */
    .sig-cell {
      text-align: center;
      padding: 6px 2px !important;
      width: 32px;
    }
    .sig-dot {
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: 4px;
      background: #e5e7eb;
      border: 1px solid #d1d5db;
    }
    .sig-yes {
      background: #bbf7d0 !important;
      border-color: #4ade80 !important;
    }
    .sig-no {
      background: #fee2e2 !important;
      border-color: #fca5a5 !important;
    }

    .detail-label {
      font-size:11px; font-weight:600; color:#6b7280;
      text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px;
    }

    .tag { display:inline-block; padding:2px 6px; border-radius:4px;
           font-size:11px; background:#fff7ed; color:#c2410c; }
    .tag-sm { font-size:10px; }

    /* Zasięg geograficzny */
    .scope-badge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 4px;
      font-size: 14px; cursor: default;
      border: 1px solid transparent;
    }
    .scope-local    { background: #f3f4f6; border-color: #e5e7eb; }
    .scope-national { background: #eff6ff; border-color: #bfdbfe; }
    .scope-eu       { background: #ede9fe; border-color: #c4b5fd; }
    .scope-global   { background: #f0fdf4; border-color: #86efac; }

    /* Spinner na poziomie wiersza — zastępuje badge statusu podczas przetwarzania */
    @keyframes row-spin { to { transform: rotate(360deg); } }
    .row-spin {
      display: inline-block;
      width: 16px; height: 16px;
      border: 2px solid #fbd0b6;
      border-top-color: var(--orange);
      border-radius: 50%;
      animation: row-spin 0.75s linear infinite;
      vertical-align: middle;
    }

    .badge { display:inline-block; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:500; }
    .badge-pending   { background:#fef3c7; color:#92400e; }
    .badge-done      { background:#d1fae5; color:#065f46; }
    .badge-error     { background:#fee2e2; color:#991b1b; }
    .badge-no_website { background:#f3f4f6; color:#6b7280; }
    .badge-no_krs    { background:#f3f4f6; color:#6b7280; }
    .badge-hold      { background:#e0e7ff; color:#3730a3; }
    .badge-archived  { background:#f3f4f6; color:#6b7280; }
    .badge-lead      { background:#dbeafe; color:#1e40af; }
    .badge-db        { background:#fef0e9; color:#c2410c; font-size:10px; padding:1px 6px; border-radius:8px; }

    .btn-menu {
      width:28px; height:28px; border:1px solid #e5e7eb; border-radius:6px;
      background:none; cursor:pointer; font-size:16px; line-height:1;
      display:flex; align-items:center; justify-content:center;
      color:#6b7280; transition:background .12s, border-color .12s;
    }
    .btn-menu:hover:not(:disabled) { background:#f3f4f6; border-color:#d1d5db; color:#111; }
    .btn-menu-active { background:#f3f4f6; border-color:var(--orange); color:var(--orange) !important; }
    .btn-menu:disabled { opacity:.4; cursor:default; }

    /* Dropdown — position:fixed, poza flow tabeli */
    .row-menu {
      position:fixed; z-index:9999;
      background:white; border:1px solid #e5e7eb; border-radius:8px;
      box-shadow:0 4px 16px rgba(0,0,0,.12); padding:4px;
      min-width:180px;
    }
    .mi {
      display:block; width:100%; text-align:left; padding:7px 12px;
      border:none; background:none; cursor:pointer; font-size:13px;
      border-radius:5px; color:#374151; white-space:nowrap;
    }
    .mi:hover { background:#f3f4f6; }
    .mi-danger { color:#991b1b; }
    .mi-danger:hover { background:#fee2e2; }
    .mi-sep { height:1px; background:#f3f4f6; margin:3px 0; }

    code { font-family:monospace; background:#f3f4f6; padding:1px 4px;
           border-radius:3px; font-size:12px; }

    /* Log enrichmentu */
    .enrich-log {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid #e5e7eb;
    }
    .log-steps { display: flex; flex-direction: column; gap: 6px; }
    .log-step {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 12px;
      line-height: 1.5;
    }
    .log-step-claude { align-items: flex-start; }
    .log-badge {
      flex-shrink: 0;
      width: 36px; height: 20px;
      border-radius: 4px;
      font-size: 10px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      background: #f3f4f6; color: #6b7280;
    }
    .log-badge-ok  { background: #d1fae5; color: #065f46; }
    .log-badge-err { background: #fee2e2; color: #991b1b; }
    .log-step-body { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 4px; flex: 1; }
    .log-ok   { color: #065f46; font-weight: 500; }
    .log-err  { color: #991b1b; font-weight: 500; }
    .log-detail { color: #374151; }
    .log-muted  { color: #9ca3af; font-style: italic; }
    .log-expand-btn {
      background: none; border: none; padding: 0 0 0 4px; margin: 0;
      color: #6b7280; font-size: 11px; font-style: italic; cursor: pointer;
      &:hover { color: #3BAA5D; text-decoration: underline; }
    }

    /* Sekcja sygnałów w logu Claude */
    .log-signals {
      width: 100%; margin-top: 8px;
      display: flex; flex-direction: column; gap: 5px;
    }
    .log-signal-row {
      display: flex; align-items: baseline; gap: 8px;
      padding: 4px 8px;
      background: #fff; border: 1px solid #f3f4f6; border-radius: 5px;
    }
    .log-sig-dot {
      width: 10px; height: 10px; flex-shrink: 0;
      border-radius: 3px;
      background: #e5e7eb; border: 1px solid #d1d5db;
      margin-top: 3px;
    }
    .log-signal-key {
      flex-shrink: 0;
      width: 68px;
      font-weight: 600; font-size: 11px; color: #374151;
    }
    .log-signal-reason { font-size: 12px; color: #6b7280; line-height: 1.4; }
    .log-branches {
      margin-top: 6px;
      font-size: 12px;
      display: flex; flex-wrap: wrap; gap: 4px;
      align-items: baseline;
      padding: 4px 8px;
      background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 5px;
    }

    /* ── Inspect modal ─────────────────────────────── */
    .inspect-overlay {
      position: fixed; inset: 0; z-index: 3000;
      background: rgba(0,0,0,0.5);
    }
    .inspect-modal {
      position: fixed; z-index: 3001;
      top: 4vh; left: 50%; transform: translateX(-50%);
      width: min(920px, calc(100vw - 32px));
      max-height: 92vh;
      background: #fff; border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.28);
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .inspect-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 16px 20px 12px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }
    .inspect-title {
      display: flex; flex-direction: column; gap: 2px;
    }
    .inspect-company {
      font-size: 16px; font-weight: 700; color: var(--orange);
    }
    .inspect-close {
      flex-shrink: 0; margin-top: 2px;
      width: 28px; height: 28px;
      border: 1px solid #e5e7eb; border-radius: 6px;
      background: none; cursor: pointer; font-size: 14px;
      color: #6b7280; line-height: 1;
    }
    .inspect-close:hover { background: #f3f4f6; color: #111; }
    .inspect-body {
      display: grid; grid-template-columns: 250px 1fr;
      overflow: hidden; flex: 1 1 auto; min-height: 0;
    }
    .inspect-col-left {
      padding: 14px;
      border-right: 1px solid #e5e7eb;
      overflow-y: auto;
      display: flex; flex-direction: column; gap: 10px;
    }
    .inspect-col-right {
      padding: 14px;
      overflow-y: auto;
    }
    .inspect-section-title {
      font-size: 10px; font-weight: 700; color: #9ca3af;
      text-transform: uppercase; letter-spacing: 0.6px;
      margin-bottom: 8px;
    }
    .inspect-card {
      border: 1px solid #e5e7eb; border-radius: 8px;
      padding: 9px 11px; background: #fafafa;
    }
    .inspect-card-header {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 7px;
    }
    .inspect-badge {
      padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700;
      background: #f3f4f6; color: #6b7280; flex-shrink: 0;
    }
    .inspect-badge-ok  { background: #d1fae5; color: #065f46; }
    .inspect-badge-err { background: #fee2e2; color: #991b1b; }
    .inspect-kv { display: flex; flex-direction: column; gap: 4px; }
    .inspect-row { display: flex; gap: 6px; font-size: 12px; line-height: 1.4; }
    .ik { color: #6b7280; flex-shrink: 0; min-width: 84px; }
    .iv { color: #111827; flex: 1; word-break: break-all; }
    .inspect-highlight { color: var(--orange); font-weight: 600; }
    .inspect-muted { color: #9ca3af; font-style: italic; }
    .inspect-link { color: var(--orange); text-decoration: none; word-break: break-all; }
    .inspect-link:hover { text-decoration: underline; }

    .inspect-signals { display: flex; flex-direction: column; gap: 4px; }
    .inspect-signal-row {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 7px 10px; border-radius: 6px;
      border: 1px solid #f3f4f6; background: #fafafa;
    }
    .inspect-signal-true  { background: #f0fdf4; border-color: #bbf7d0; }
    .inspect-signal-false { background: #fff5f5; border-color: #fecaca; }
    .inspect-sig-dot { margin-top: 3px; flex-shrink: 0; }
    .inspect-signal-body { flex: 1; min-width: 0; }
    .inspect-signal-name  { font-size: 12px; font-weight: 600; color: #374151; }
    .inspect-signal-reason { font-size: 11px; color: #6b7280; margin-top: 2px; line-height: 1.4; }
    .inspect-signal-val {
      flex-shrink: 0; font-size: 10px; font-family: monospace;
      padding: 1px 5px; border-radius: 4px;
      background: #f3f4f6; color: #374151; align-self: flex-start;
      border: none;
    }

    .inspect-score-breakdown {
      border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;
    }
    .sb-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 12px; font-size: 12px; color: #374151;
      border-bottom: 1px solid #f3f4f6;
    }
    .sb-row:last-child { border-bottom: none; }
    .sb-total {
      background: #fef0e9; font-weight: 700; font-size: 14px;
      border-top: 2px solid #fbd0b6 !important;
    }
    .sb-value { font-weight: 600; }
    .sb-plus { color: #16a34a; }
    .sb-minus { color: #dc2626; }

    .inspect-footer {
      border-top: 1px solid #e5e7eb;
      padding: 14px 20px;
      overflow-y: auto;
      flex-shrink: 0;
      max-height: 220px;
      background: #fafafa;
    }
    .inspect-contact-card {
      border: 1px solid #e5e7eb; border-radius: 6px;
      padding: 8px 10px; background: #fff;
      min-width: 160px; max-width: 240px;
    }
    .inspect-tabs {
      display: flex; gap: 2px;
      background: #f3f4f6; padding: 3px; border-radius: 8px;
    }
    .inspect-tab {
      padding: 4px 14px; border-radius: 6px; border: none;
      background: none; cursor: pointer; font-size: 12px;
      font-weight: 500; color: #6b7280; transition: all .12s;
    }
    .inspect-tab:hover { background: #e5e7eb; color: #374151; }
    .inspect-tab-active { background: #fff !important; color: #111827 !important; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .inspect-prompt-view {
      flex: 1 1 auto; min-height: 0; overflow: hidden;
      display: flex; flex-direction: column;
    }
    .inspect-prompt-pre {
      flex: 1 1 auto; overflow: auto;
      margin: 0; padding: 16px 20px;
      font-family: 'Consolas', 'Fira Mono', monospace; font-size: 12px;
      line-height: 1.6; color: #1f2937;
      white-space: pre-wrap; word-break: break-word;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }
  `],
})
export class AdminProspectsComponent implements OnInit, OnDestroy {
  private http        = inject(HttpClient);
  private router      = inject(Router);
  private route       = inject(ActivatedRoute);
  private appSettings = inject(AppSettingsService);
  navBack             = inject(NavBackService);
  private toast       = inject(ToastService);

  minLeadScore = computed(() => Number(this.appSettings.settings()['prospect_lead_min_score'] ?? 45));

  readonly signalDefs = SIGNAL_DEFS;

  rows       = signal<Prospect[]>([]);
  total      = signal(0);
  grandTotal = signal(0);
  pages    = signal(1);
  page     = signal(1);
  loading  = signal(false);
  expanded = signal<number | null>(null);

  importing    = signal(false);
  importFile   = signal<File | null>(null);
  importResult = signal<{
    added?: number; skipped?: number; errors?: number; total?: number;
    detected_columns?: string[]; error_details?: string[];
    detected_encoding?: string;
    fatal_error?: string;
  } | null>(null);

  enriching      = signal(false);
  batch          = signal<BatchProgress>({ running: false, total: 0, done: 0, errors: 0 });
  processingIds  = signal<Set<number>>(new Set());
  expandedGusIds = signal<Set<number>>(new Set());

  toggleGusExpand(id: number, event: MouseEvent) {
    event.stopPropagation();
    this.expandedGusIds.update(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  private pollTimer: any;

  toLeadLoading   = signal<number | null>(null);
  statusActioning = signal<number | null>(null);

  // Modal: potwierdzenie NIP + przypisanie handlowca przed utworzeniem leada
  toLeadDialog          = signal<Prospect | null>(null);
  toLeadDuplicateError  = signal<{ src: string; id: string; company: string } | null>(null);
  salesUsers            = signal<{ id: string; display_name: string }[]>([]);
  toLeadAssignedTo      = signal<string>('');
  toLeadNipValue   = '';
  toLeadTagValue   = '';
  get toLeadNipDigits(): string { return this.toLeadNipValue.replace(/\D/g, ''); }

  // Zaznaczanie i akcje masowe
  selectedIds  = signal<Set<number>>(new Set());
  bulkActioning = signal(false);

  // Re-process dialog — edycja pól przed przetworzeniem
  reprocessTarget       = signal<Prospect | null>(null);
  reprocessUrlValue     = '';
  reprocessNipValue     = '';
  reprocessLinkedinValue = '';
  reprocessDoLinkedin   = false;

  // Inspect modal — wizualizacja logiki enrichmentu
  inspectTarget = signal<Prospect | null>(null);
  inspectScoreBreakdown = computed(() => {
    const p = this.inspectTarget();
    return p ? this.calcScoreBreakdown(p) : null;
  });
  inspectView   = signal<'analysis' | 'prompt'>('analysis');
  inspectPrompt = signal<string | null>(null);
  inspectPromptLoading = signal(false);

  allSelected  = computed(() => {
    const ids = this.selectedIds();
    const visible = this.rows();
    return visible.length > 0 && visible.every(r => ids.has(r.id));
  });
  someSelected  = computed(() => this.selectedIds().size > 0);
  indeterminate = computed(() => this.someSelected() && !this.allSelected());

  // Dropdown menu
  openMenu = signal<number | null>(null);
  menuPos  = signal<{ top: number; right: number } | null>(null);

  activeMenuProspect = computed(() => {
    const id = this.openMenu();
    if (id == null) return null;
    return this.rows().find(r => r.id === id) ?? null;
  });

  @HostListener('document:click')
  closeMenu() {
    this.openMenu.set(null);
    this.menuPos.set(null);
  }

  openMenuFor(event: MouseEvent, id: number) {
    event.stopPropagation();
    if (this.openMenu() === id) { this.closeMenu(); return; }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPos.set({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    this.openMenu.set(id);
  }

  filters = {
    search: '', status: '', score_min: '', score_max: '',
    imported_from: '', imported_to: '', enriched_from: '', enriched_to: '',
  };
  showArchived = signal(false);

  sort = signal('imported_at');
  dir  = signal<'asc' | 'desc'>('desc');

  private filterTimer: any;

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('search'))        this.filters.search        = qp.get('search')!;
    if (qp.get('status'))        this.filters.status        = qp.get('status')!;
    if (qp.get('score_min'))     this.filters.score_min     = qp.get('score_min')!;
    if (qp.get('score_max'))     this.filters.score_max     = qp.get('score_max')!;
    if (qp.get('imported_from')) this.filters.imported_from = qp.get('imported_from')!;
    if (qp.get('imported_to'))   this.filters.imported_to   = qp.get('imported_to')!;
    if (qp.get('enriched_from')) this.filters.enriched_from = qp.get('enriched_from')!;
    if (qp.get('enriched_to'))   this.filters.enriched_to   = qp.get('enriched_to')!;
    if (qp.get('show_archived') === 'true') this.showArchived.set(true);
    const pg = parseInt(qp.get('page') ?? '', 10);
    if (!isNaN(pg) && pg > 0) this.page.set(pg);
    const validSorts = ['imported_at', 'enriched_at', 'icp_score', 'company_name'];
    const sortParam = qp.get('sort');
    if (sortParam && validSorts.includes(sortParam)) this.sort.set(sortParam);
    const dirParam = qp.get('dir');
    if (dirParam === 'asc' || dirParam === 'desc') this.dir.set(dirParam);
    this.load();
    this.pollBatch();
  }
  ngOnDestroy() { clearTimeout(this.pollTimer); }

  load() {
    this.loading.set(true);
    const p = new URLSearchParams({
      page: String(this.page()),
      limit: '50',
      sort: this.sort(),
      dir: this.dir(),
      ...Object.fromEntries(
        (Object.entries(this.filters) as [string, string][]).filter(([, v]) => v !== '')
      ),
      ...(this.showArchived() ? { show_archived: 'true' } : {}),
    });
    this.http.get<any>(`${API}?${p}`).subscribe({
      next: r => {
        this.rows.set(r.rows);
        this.total.set(r.total);
        this.grandTotal.set(r.grand_total ?? this.grandTotal());
        this.pages.set(r.pages);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // Odświeżenie danych bez overlay — używane podczas pollingu enrichmentu
  private loadSilent() {
    const p = new URLSearchParams({
      page: String(this.page()),
      limit: '50',
      sort: this.sort(),
      dir: this.dir(),
      ...Object.fromEntries(
        (Object.entries(this.filters) as [string, string][]).filter(([, v]) => v !== '')
      ),
      ...(this.showArchived() ? { show_archived: 'true' } : {}),
    });
    this.http.get<any>(`${API}?${p}`).subscribe({
      next: r => {
        this.rows.set(r.rows);
        this.total.set(r.total);
        this.grandTotal.set(r.grand_total ?? this.grandTotal());
        this.pages.set(r.pages);
      },
    });
  }

  onFilterChange() {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => { this.page.set(1); this.load(); }, 400);
  }

  resetFilters() {
    (Object.keys(this.filters) as (keyof typeof this.filters)[]).forEach(k => this.filters[k] = '');
    this.showArchived.set(false);
    this.page.set(1);
    this.load();
  }

  setPage(p: number) { this.page.set(p); this.load(); }

  setSort(col: string) {
    if (this.sort() === col) this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    else { this.sort.set(col); this.dir.set('desc'); }
    this.page.set(1);
    this.load();
  }

  sortIcon(col: string) {
    return this.sort() !== col ? '' : (this.dir() === 'asc' ? '↑' : '↓');
  }

  toggleExpand(id: number) {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  // ── Import CSV ──────────────────────────────────────────────────

  onFileSelected(event: Event) {
    const f = (event.target as HTMLInputElement).files?.[0];
    if (f) { this.importFile.set(f); this.importResult.set(null); }
  }

  doImport() {
    const f = this.importFile();
    if (!f) return;
    this.importing.set(true);
    this.importResult.set(null);
    const fd = new FormData();
    fd.append('file', f);
    this.http.post<any>(`${API}/import`, fd).subscribe({
      next: r => {
        this.importResult.set(r);
        this.importing.set(false);
        this.importFile.set(null);
        this.page.set(1);
        this.load();
      },
      error: err => {
        this.importResult.set({ fatal_error: err?.error?.error || err?.message || `HTTP ${err?.status}` });
        this.importing.set(false);
      },
    });
  }

  // ── Batch enrichment ────────────────────────────────────────────

  startBatch() {
    this.enriching.set(true);
    this.http.post<any>(`${API}/enrich-batch`, {}).subscribe({
      next: () => { this.enriching.set(false); this.pollBatch(); },
      error: () => this.enriching.set(false),
    });
  }

  pollBatch() {
    this.http.get<BatchProgress>(`${API}/enrich-status`).subscribe({
      next: s => {
        this.batch.set(s);

        // Synchronizuj processing_ids ze stanu backendu
        const ids = new Set<number>(s.processing_ids ?? []);
        this.processingIds.set(ids);

        if (s.running) {
          // loadSilent — odświeżenie bez overlay (brak skoku strony)
          this.pollTimer = setTimeout(() => { this.pollBatch(); this.loadSilent(); }, 3000);
        } else {
          // Po zakończeniu wyczyść spinner i odśwież pełny stan
          this.processingIds.set(new Set());
          if (s.total > 0) this.load();
        }
      },
      error: () => {},
    });
  }

  // ── Export CSV ──────────────────────────────────────────────────

  exportCsv() {
    const p = new URLSearchParams(
      Object.fromEntries(
        (Object.entries(this.filters) as [string, string][]).filter(([, v]) => v !== '')
      )
    );
    window.open(`${API}/export?${p}`, '_blank');
  }

  // ── → Lead ──────────────────────────────────────────────────────

  toLead(p: Prospect) {
    this.toLeadAssignedTo.set('');
    this.toLeadDuplicateError.set(null);
    this.toLeadNipValue = p.nip || '';
    this.toLeadTagValue = '';
    this.toLeadDialog.set(p);
    if (!this.salesUsers().length) {
      this.http.get<{ id: string; display_name: string }[]>(
        `${environment.apiUrl}/crm/leads/users`
      ).subscribe({ next: users => this.salesUsers.set(users), error: () => {} });
    }
  }

  confirmToLead() {
    const p = this.toLeadDialog();
    if (!p) return;
    const nip = this.toLeadNipValue.replace(/\D/g, '');
    if (nip.length !== 10) return;
    this.toLeadLoading.set(p.id);
    this.toLeadDuplicateError.set(null);
    const body: Record<string, string> = {};
    if (this.toLeadAssignedTo()) body['assigned_to'] = this.toLeadAssignedTo();
    body['nip'] = nip;
    if (this.toLeadTagValue.trim()) body['tag'] = this.toLeadTagValue.trim();
    if (this.toLeadDuplicateError()) body['force'] = 'true';
    this.http.post<{ crm_lead_id: number }>(`${API}/${p.id}/to-lead`, body).subscribe({
      next: r => {
        this.toLeadLoading.set(null);
        this.toLeadDialog.set(null);
        this.rows.update(rows => rows.map(row =>
          row.id === p.id
            ? { ...row, crm_lead_id: r.crm_lead_id, enrichment_status: 'lead' }
            : row
        ));
        this.toast.success(`Lead utworzony: ${p.company_name || p.nip}`);
      },
      error: err => {
        this.toLeadLoading.set(null);
        if (err.status === 409 && err.error?.error === 'duplicate_company') {
          this.toLeadDuplicateError.set(err.error.existing);
        } else if (err.status === 409 && err.error?.nip_conflict) {
          this.toast.error(err.error.error);
        } else if (err.status === 409) {
          this.toLeadDialog.set(null);
          this.load();
        }
      },
    });
  }

  goToLead(leadId: number, _nip?: string | null) {
    const qp: Record<string, string> = {};
    if (this.filters.search)        qp['search']        = this.filters.search;
    if (this.filters.status)        qp['status']        = this.filters.status;
    if (this.filters.score_min)     qp['score_min']     = this.filters.score_min;
    if (this.filters.score_max)     qp['score_max']     = this.filters.score_max;
    if (this.filters.imported_from) qp['imported_from'] = this.filters.imported_from;
    if (this.filters.imported_to)   qp['imported_to']   = this.filters.imported_to;
    if (this.filters.enriched_from) qp['enriched_from'] = this.filters.enriched_from;
    if (this.filters.enriched_to)   qp['enriched_to']   = this.filters.enriched_to;
    if (this.showArchived())        qp['show_archived'] = 'true';
    if (this.page() !== 1)          qp['page']          = String(this.page());
    if (this.sort() !== 'imported_at') qp['sort']       = this.sort();
    if (this.dir() !== 'desc')      qp['dir']           = this.dir();
    this.navBack.set({ label: 'Prospekty', route: ['/admin/prospects'], queryParams: qp, targetUrlPrefix: '/crm/leads' });
    this.router.navigate(['/crm/leads', leadId]);
  }

  goToPartner(navId: string, nip?: string | null) {
    if (nip) this.navBack.set({ label: 'Prospekty', route: ['/admin/prospects'], queryParams: { search: nip }, targetUrlPrefix: '/crm/partners' });
    this.router.navigate(['/crm/partners', navId]);
  }

  noteEdits = new Map<number, string>();

  onNoteInput(id: number, value: string) {
    this.noteEdits.set(id, value.slice(0, 500));
  }

  saveNote(p: Prospect) {
    const note = this.noteEdits.get(p.id) ?? p.note ?? '';
    if (note === (p.note ?? '')) { this.noteEdits.delete(p.id); return; }
    this.http.patch<any>(`${API}/${p.id}/note`, { note }).subscribe({
      next: r => {
        p.note            = r.note;
        p.note_author     = r.note_author;
        p.note_updated_at = r.note_updated_at;
        this.noteEdits.delete(p.id);
      },
      error: e => this.toast.error(e.error?.error || 'Błąd zapisu notatki'),
    });
  }

  navigateBack() {
    const ctx = this.navBack.ctx();
    if (!ctx) return;
    this.navBack.clear();
    this.router.navigate(ctx.route, { queryParams: ctx.queryParams });
  }

  // ── Status management ────────────────────────────────────────────

  setStatus(p: Prospect, status: string) {
    this.statusActioning.set(p.id);
    this.http.patch<{ id: number; enrichment_status: string }>(`${API}/${p.id}/status`, { status }).subscribe({
      next: updated => {
        this.rows.update(rows => rows.map(r =>
          r.id === p.id ? { ...r, enrichment_status: updated.enrichment_status } : r
        ));
        this.statusActioning.set(null);
      },
      error: () => this.statusActioning.set(null),
    });
  }

  reProcess(p: Prospect) {
    this.statusActioning.set(p.id);
    this.processingIds.update(set => new Set([...set, p.id]));
    this.http.post<{ queued: boolean }>(`${API}/${p.id}/re-process`, {}).subscribe({
      next: () => {
        this.statusActioning.set(null);
        this.expanded.set(null);
        this.pollBatch();
      },
      error: () => {
        this.statusActioning.set(null);
        this.processingIds.update(set => { const n = new Set(set); n.delete(p.id); return n; });
      },
    });
  }

  /** Wyświetla domenę bez protokołu, max 28 znaków */
  shortUrl(url: string | null): string {
    if (!url) return '';
    const domain = url.replace(/^https?:\/\//i, '');
    return domain.length > 28 ? domain.slice(0, 28) + '…' : domain;
  }

  openReprocessDialog(p: Prospect) {
    this.reprocessTarget.set(p);
    this.reprocessUrlValue      = p.website_url || '';
    this.reprocessNipValue      = '';
    this.reprocessLinkedinValue = p.linkedin_url || 'https://www.linkedin.com/company/';
    this.reprocessDoLinkedin    = false;
    this.closeMenu();
  }

  confirmReprocess() {
    const p = this.reprocessTarget();
    if (!p) return;
    this.reprocessTarget.set(null);
    this.statusActioning.set(p.id);
    this.processingIds.update(set => new Set([...set, p.id]));

    const body: {
      website_url?: string;
      nip?: string;
      linkedin_url?: string;
      process_linkedin?: boolean;
    } = {};

    const url      = this.reprocessUrlValue.trim();
    const nip      = this.reprocessNipValue.replace(/\D/g, '');
    const linkedin = this.reprocessLinkedinValue.trim();

    if (url)     body.website_url     = url;
    if (nip)     body.nip             = nip;
    if (linkedin) body.linkedin_url   = linkedin;
    if (this.reprocessDoLinkedin) body.process_linkedin = true;

    this.http.post<{ queued: boolean }>(`${API}/${p.id}/re-process`, body).subscribe({
      next: () => {
        this.statusActioning.set(null);
        this.expanded.set(null);
        this.pollBatch();
      },
      error: (err) => {
        this.statusActioning.set(null);
        this.processingIds.update(set => { const n = new Set(set); n.delete(p.id); return n; });
        if (err.status === 409) {
          this.toast.error(err.error?.error || 'Konflikt NIP — inny rekord ma już ten numer.');
        }
      },
    });
  }

  deleteProspect(p: Prospect) {
    const label = p.company_name || p.nip;
    const warn  = p.crm_lead_id
      ? '\n\nUwaga: ten prospekt ma powiązany lead CRM. Lead pozostanie, usunięty zostanie tylko prospekt.'
      : '';
    if (!confirm(`Usunąć prospekt "${label}"?${warn}`)) return;
    this.closeMenu();

    this.statusActioning.set(p.id);
    this.http.delete<{ deleted: boolean }>(`${API}/${p.id}`).subscribe({
      next: () => {
        this.statusActioning.set(null);
        this.expanded.set(null);
        this.rows.update(rows => rows.filter(r => r.id !== p.id));
        this.total.update(t => t - 1);
      },
      error: () => this.statusActioning.set(null),
    });
  }

  // ── Zaznaczanie ──────────────────────────────────────────────────

  toggleSelect(id: number) {
    this.selectedIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  toggleSelectAll() {
    if (this.allSelected()) {
      // Odznacz wszystkie widoczne
      const visible = new Set(this.rows().map(r => r.id));
      this.selectedIds.update(set => {
        const next = new Set(set);
        visible.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // Zaznacz wszystkie widoczne (dodaj do istniejącego zaznaczenia)
      this.selectedIds.update(set => {
        const next = new Set(set);
        this.rows().forEach(r => next.add(r.id));
        return next;
      });
    }
  }

  clearSelection() {
    this.selectedIds.set(new Set());
  }

  // ── Akcje masowe ─────────────────────────────────────────────────

  bulkSetStatus(status: string) {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.bulkActioning.set(true);
    forkJoin(ids.map(id => this.http.patch<any>(`${API}/${id}/status`, { status }))).subscribe({
      next: () => {
        this.bulkActioning.set(false);
        this.clearSelection();
        this.load();
      },
      error: () => { this.bulkActioning.set(false); this.load(); },
    });
  }

  bulkReProcess() {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.bulkActioning.set(true);
    // Optymistycznie pokaż spinnery na wszystkich zaznaczonych wierszach
    this.processingIds.update(set => new Set([...set, ...ids]));
    forkJoin(ids.map(id => this.http.post<any>(`${API}/${id}/re-process`, {}))).subscribe({
      next: () => {
        this.bulkActioning.set(false);
        this.clearSelection();
        this.expanded.set(null);
        this.pollBatch();
      },
      error: () => {
        this.bulkActioning.set(false);
        this.processingIds.update(set => {
          const n = new Set(set);
          ids.forEach(id => n.delete(id));
          return n;
        });
        this.load();
      },
    });
  }

  bulkDelete() {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    if (!confirm(`Usunąć ${ids.length} zaznaczonych prospektów? Tej operacji nie można cofnąć.`)) return;
    this.bulkActioning.set(true);
    forkJoin(ids.map(id => this.http.delete<any>(`${API}/${id}`))).subscribe({
      next: () => {
        this.bulkActioning.set(false);
        this.clearSelection();
        this.expanded.set(null);
        this.load();
      },
      error: () => { this.bulkActioning.set(false); this.load(); },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────

  getSignal(p: Prospect, key: string): boolean | null {
    let raw: unknown = p.icp_signals;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return null; }
    }
    if (!Array.isArray(raw)) return null;
    const found = (raw as IcpSignalHit[]).find(s => s.id === key);
    return found ? found.hit : null;
  }

  signalTooltip(p: Prospect, key: string, desc: string): string {
    const val = this.getSignal(p, key);
    if (val === true)  return `✓ ${desc}`;
    if (val === false) return `✗ ${desc}`;
    return desc;
  }

  qualifiesForLead(p: Prospect): boolean {
    return p.icp_score != null && p.icp_score >= this.minLeadScore();
  }

  leadButtonTooltip(p: Prospect): string {
    if (p.icp_score == null) return 'Firma nie została jeszcze wzbogacona — brak score';
    if (!this.qualifiesForLead(p)) {
      return `Score zbyt niski (${p.icp_score}/100). Wymagane ≥ ${this.minLeadScore()}. Próg konfigurowalny w App Settings → CRM.`;
    }
    return 'Utwórz lead w CRM';
  }

  // Progi przeliczone pod nowy max ICP (65 za sygnały + 10 bonus = 75, nie 100
  // jak w starym systemie) — 60%/33% z 75, zaokrąglone.
  scoreColor(score: number): string {
    if (score >= 45) return '#16a34a';
    if (score >= 25) return '#d97706';
    return '#dc2626';
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      pending: 'Oczekuje', done: 'Wzbogacone', error: 'Błąd',
      no_website: 'Brak WWW', no_krs: 'Brak KRS',
      hold: 'Hold', archived: 'Archiwum', lead: 'Lead w CRM',
    };
    return map[s] || s;
  }

  statusClass(s: string): string { return `badge badge-${s}`; }

  gateStatusIcon(status: string): string {
    return { qualified: '✅', disqualified: '⛔', needs_review: '❓' }[status] ?? status;
  }

  gateStatusLabel(status: string): string {
    return {
      qualified: 'Zakwalifikowana (B2B + wielkość: pass)',
      disqualified: 'Odrzucona (potwierdzony fail bramki)',
      needs_review: 'Do ręcznego przeglądu (brak pewnych danych)',
    }[status] ?? status;
  }

  websiteMethodLabel(method: string): string {
    const map: Record<string, string> = {
      krs:        'rejestr KRS',
      heuristic:  'zgadnięta z nazwy',
      google_cse: 'Google CSE',
      bing:       'Bing',
      duckduckgo: 'DuckDuckGo',
      serper:     'Google (Serper)',
      manual:     'ustawiona ręcznie',
      none:       'nie znaleziono',
    };
    return map[method] || method;
  }

  // ── Inspect helpers ─────────────────────────────────────────────

  openInspect(p: Prospect) {
    this.inspectTarget.set(p);
    this.inspectView.set('analysis');
    this.inspectPrompt.set(null);
    this.closeMenu();
  }

  switchToPrompt() {
    this.inspectView.set('prompt');
    if (this.inspectPrompt() !== null || this.inspectPromptLoading()) return;
    const p = this.inspectTarget();
    if (!p) return;
    this.inspectPromptLoading.set(true);
    this.http.get<{ prompt: string }>(`${API}/${p.id}/prompt`).subscribe({
      next: r => { this.inspectPrompt.set(r.prompt); this.inspectPromptLoading.set(false); },
      error: ()  => { this.inspectPrompt.set('Błąd wczytywania promptu.'); this.inspectPromptLoading.set(false); },
    });
  }

  getSignalReasoning(p: Prospect, s: { key: string; reasoningKey: string }): string | null {
    const r = p.enrichment_log?.claude?.signal_reasoning;
    if (!r) return null;
    // reasoningKey = nazwa pola z promptu AI (np. field_sales_team), różna od
    // `key` = id sygnału (np. dzial_handlowy) dla 7 z 8 sygnałów. Fallback do
    // `key` — starsze rekordy sprzed wprowadzenia promptKey mogły zapisać
    // reasoning pod samym id.
    return r[s.reasoningKey] || r[s.key] || null;
  }

  // Backend liczy już cały breakdown (icp_signals/icp_gates/icp_bonus_signals) —
  // tu tylko składamy to w kształt wygodny do renderowania w inspektorze,
  // bez powtarzania formuły scoringu po stronie frontendu.
  calcScoreBreakdown(p: Prospect): {
    trueCount: number; raw: number; bonus: number; downgradePenalty: number; total: number;
    gates: IcpGates; gateStatus: string;
    bonusBreakdown: IcpBonusHit[];
    downgradeFlags: IcpDowngradeFlag[];
  } {
    const signals = p.icp_signals ?? [];
    const trueCount = signals.filter(s => s.hit).length;
    const raw = signals.filter(s => s.hit).reduce((sum, s) => sum + s.points, 0);
    const bonusBreakdown = p.icp_bonus_signals ?? [];
    const bonus = bonusBreakdown.filter(b => b.hit).reduce((sum, b) => sum + b.points, 0);
    const downgradeFlags = p.icp_downgrade_flags ?? [];
    const downgradePenalty = downgradeFlags.reduce((sum, f) => sum + (f.points ?? 0), 0);
    return {
      trueCount, raw, bonus, downgradePenalty,
      total: p.icp_score ?? Math.max(0, Math.min(100, raw + bonus + downgradePenalty)),
      gates: p.icp_gates ?? { b2b: 'unknown', company_size: 'unknown' },
      gateStatus: p.icp_gate_status ?? 'needs_review',
      bonusBreakdown,
      downgradeFlags,
    };
  }
}