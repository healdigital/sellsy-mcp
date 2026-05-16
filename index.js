#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// --- Configuration ---
const SELLSY_API_BASE = "https://api.sellsy.com/v2";
const TOKEN_URL = "https://login.sellsy.com/oauth2/access-tokens";
const CLIENT_ID = process.env.SELLSY_CLIENT_ID;
const CLIENT_SECRET = process.env.SELLSY_CLIENT_SECRET;

// --- Token Management ---
let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) {
    return accessToken;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth2 token error (${res.status}): ${text}`);
  }
  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return accessToken;
}

// --- API Helper ---
async function api(method, path, body = null, params = null, embedArr = null) {
  const token = await getAccessToken();
  const url = new URL(`${SELLSY_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  if (embedArr && embedArr.length > 0) {
    for (const e of embedArr) {
      url.searchParams.append("embed[]", e);
    }
  }
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sellsy API ${res.status} ${method} ${path}: ${text}`);
  }
  if (res.status === 204) return { success: true };
  return res.json();
}

function r(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// Reusable schemas
const pagination = {
  limit: z.number().optional().describe("Max results (default 25)"),
  offset: z.string().optional().describe("Pagination offset (seek method)"),
};
const embed = { embed: z.array(z.string()).optional().describe("Related objects to embed") };
const flexBody = z.object({}).passthrough();

// --- MCP Server ---
const server = new McpServer({ name: "sellsy", version: "1.0.0" });

// =====================
// COMPANIES
// =====================
server.tool("list_companies", "List companies with pagination", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/companies", null, { limit, offset }, e));
});
server.tool("get_company", "Get a company by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/companies/${id}`, null, null, e));
});
server.tool("search_companies", "Search companies with filters", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/companies/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_company", "Create a company", { body: flexBody.describe("name (required), type (client/prospect/supplier), email, phone, website, etc.") }, async ({ body }) => {
  return r(await api("POST", "/companies", body));
});
server.tool("update_company", "Update a company", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/companies/${id}`, body));
});
server.tool("delete_company", "Delete a company", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/companies/${id}`));
});
server.tool("convert_company", "Convert prospect to client", { id: z.number() }, async ({ id }) => {
  return r(await api("POST", `/companies/${id}/convert`));
});
server.tool("list_company_contacts", "List contacts linked to a company", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/companies/${id}/contacts`));
});
server.tool("link_contact_to_company", "Link a contact to a company", { companyId: z.number(), contactId: z.number(), body: flexBody.optional() }, async ({ companyId, contactId, body }) => {
  return r(await api("POST", `/companies/${companyId}/contacts/${contactId}`, body || {}));
});
server.tool("update_contact_company_link", "Update contact-company link", { companyId: z.number(), contactId: z.number(), body: flexBody }, async ({ companyId, contactId, body }) => {
  return r(await api("PUT", `/companies/${companyId}/contacts/${contactId}`, body));
});
server.tool("unlink_contact_from_company", "Unlink contact from company", { companyId: z.number(), contactId: z.number() }, async ({ companyId, contactId }) => {
  return r(await api("DELETE", `/companies/${companyId}/contacts/${contactId}`));
});
server.tool("list_company_addresses", "List addresses of a company", { companyId: z.number() }, async ({ companyId }) => {
  return r(await api("GET", `/companies/${companyId}/addresses`));
});
server.tool("create_company_address", "Create an address for a company", { companyId: z.number(), body: flexBody.describe("name, address_line_1, city, postal_code, country_code") }, async ({ companyId, body }) => {
  return r(await api("POST", `/companies/${companyId}/addresses`, body));
});
server.tool("get_company_address", "Get a company address", { companyId: z.number(), addressId: z.number() }, async ({ companyId, addressId }) => {
  return r(await api("GET", `/companies/${companyId}/addresses/${addressId}`));
});
server.tool("update_company_address", "Update a company address", { companyId: z.number(), addressId: z.number(), body: flexBody }, async ({ companyId, addressId, body }) => {
  return r(await api("PUT", `/companies/${companyId}/addresses/${addressId}`, body));
});
server.tool("delete_company_address", "Delete a company address", { companyId: z.number(), addressId: z.number() }, async ({ companyId, addressId }) => {
  return r(await api("DELETE", `/companies/${companyId}/addresses/${addressId}`));
});
server.tool("get_company_custom_fields", "Get custom fields of a company", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/companies/${id}/custom-fields`));
});
server.tool("update_company_custom_fields", "Update custom fields of a company", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/companies/${id}/custom-fields`, body));
});
server.tool("list_company_smart_tags", "List smart tags of a company", { companyId: z.number() }, async ({ companyId }) => {
  return r(await api("GET", `/companies/${companyId}/smart-tags`));
});
server.tool("link_company_smart_tags", "Link smart tags to a company", { companyId: z.number(), body: flexBody }, async ({ companyId, body }) => {
  return r(await api("POST", `/companies/${companyId}/smart-tags`, body));
});
server.tool("record_company_payment", "Record a payment for a company", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("POST", `/companies/${id}/payments`, body));
});
server.tool("list_company_favourite_filters", "List company favourite filters", {}, async () => {
  return r(await api("GET", "/companies/favourite-filters"));
});

// =====================
// CONTACTS
// =====================
server.tool("list_contacts", "List contacts", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/contacts", null, { limit, offset }, e));
});
server.tool("get_contact", "Get a contact by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/contacts/${id}`, null, null, e));
});
server.tool("search_contacts", "Search contacts", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/contacts/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_contact", "Create a contact", { body: flexBody.describe("first_name, last_name, email, phone, etc.") }, async ({ body }) => {
  return r(await api("POST", "/contacts", body));
});
server.tool("update_contact", "Update a contact", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/contacts/${id}`, body));
});
server.tool("delete_contact", "Delete a contact", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/contacts/${id}`));
});
server.tool("list_contact_companies", "List companies linked to a contact", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/contacts/${id}/companies`));
});
server.tool("list_contact_addresses", "List addresses of a contact", { contactId: z.number() }, async ({ contactId }) => {
  return r(await api("GET", `/contacts/${contactId}/addresses`));
});
server.tool("create_contact_address", "Create an address for a contact", { contactId: z.number(), body: flexBody }, async ({ contactId, body }) => {
  return r(await api("POST", `/contacts/${contactId}/addresses`, body));
});
server.tool("get_contact_address", "Get a contact address", { contactId: z.number(), addressId: z.number() }, async ({ contactId, addressId }) => {
  return r(await api("GET", `/contacts/${contactId}/addresses/${addressId}`));
});
server.tool("update_contact_address", "Update a contact address", { contactId: z.number(), addressId: z.number(), body: flexBody }, async ({ contactId, addressId, body }) => {
  return r(await api("PUT", `/contacts/${contactId}/addresses/${addressId}`, body));
});
server.tool("delete_contact_address", "Delete a contact address", { contactId: z.number(), addressId: z.number() }, async ({ contactId, addressId }) => {
  return r(await api("DELETE", `/contacts/${contactId}/addresses/${addressId}`));
});
server.tool("get_contact_custom_fields", "Get custom fields of a contact", { contactId: z.number() }, async ({ contactId }) => {
  return r(await api("GET", `/contacts/${contactId}/custom-fields`));
});
server.tool("update_contact_custom_fields", "Update custom fields of a contact", { contactId: z.number(), body: flexBody }, async ({ contactId, body }) => {
  return r(await api("PUT", `/contacts/${contactId}/custom-fields`, body));
});
server.tool("list_contact_smart_tags", "List smart tags of a contact", { contactId: z.number() }, async ({ contactId }) => {
  return r(await api("GET", `/contacts/${contactId}/smart-tags`));
});
server.tool("link_contact_smart_tags", "Link smart tags to a contact", { contactId: z.number(), body: flexBody }, async ({ contactId, body }) => {
  return r(await api("POST", `/contacts/${contactId}/smart-tags`, body));
});

// =====================
// INDIVIDUALS (Particuliers)
// =====================
server.tool("list_individuals", "List individuals (particuliers)", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/individuals", null, { limit, offset }, e));
});
server.tool("get_individual", "Get an individual by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/individuals/${id}`, null, null, e));
});
server.tool("search_individuals", "Search individuals", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/individuals/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_individual", "Create an individual", { body: flexBody.describe("first_name, last_name, email, type (client/prospect/supplier)") }, async ({ body }) => {
  return r(await api("POST", "/individuals", body));
});
server.tool("update_individual", "Update an individual", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/individuals/${id}`, body));
});
server.tool("delete_individual", "Delete an individual", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/individuals/${id}`));
});
server.tool("convert_individual", "Convert individual prospect to client", { id: z.number() }, async ({ id }) => {
  return r(await api("POST", `/individuals/${id}/convert`));
});
server.tool("list_individual_addresses", "List addresses of an individual", { individualId: z.number() }, async ({ individualId }) => {
  return r(await api("GET", `/individuals/${individualId}/addresses`));
});
server.tool("create_individual_address", "Create an address for an individual", { individualId: z.number(), body: flexBody }, async ({ individualId, body }) => {
  return r(await api("POST", `/individuals/${individualId}/addresses`, body));
});
server.tool("get_individual_address", "Get a specific address of an individual", { individualId: z.number(), id: z.number() }, async ({ individualId, id }) => {
  return r(await api("GET", `/individuals/${individualId}/addresses/${id}`));
});
server.tool("update_individual_address", "Update a specific address of an individual", { individualId: z.number(), id: z.number(), body: flexBody }, async ({ individualId, id, body }) => {
  return r(await api("PUT", `/individuals/${individualId}/addresses/${id}`, body));
});
server.tool("delete_individual_address", "Delete a specific address of an individual", { individualId: z.number(), id: z.number() }, async ({ individualId, id }) => {
  return r(await api("DELETE", `/individuals/${individualId}/addresses/${id}`));
});
server.tool("get_individual_custom_fields", "Get custom fields of an individual", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/individuals/${id}/custom-fields`));
});
server.tool("update_individual_custom_fields", "Update custom fields of an individual", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/individuals/${id}/custom-fields`, body));
});
server.tool("list_individual_smart_tags", "List smart tags of an individual", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/individuals/${id}/smart-tags`));
});
server.tool("link_individual_smart_tags", "Link smart tags to an individual", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("POST", `/individuals/${id}/smart-tags`, body));
});

// =====================
// INVOICES
// =====================
server.tool("list_invoices", "List invoices", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/invoices", null, { limit, offset }, e));
});
server.tool("get_invoice", "Get an invoice by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/invoices/${id}`, null, null, e));
});
server.tool("search_invoices", "Search invoices", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/invoices/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_invoice", "Create an invoice", { body: flexBody.describe("related_company (required), rows, date, due_date") }, async ({ body }) => {
  return r(await api("POST", "/invoices", body));
});
server.tool("update_invoice", "Update an invoice", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/invoices/${id}`, body));
});
server.tool("validate_invoice", "Validate (finalize) an invoice", { id: z.number() }, async ({ id }) => {
  return r(await api("PUT", `/invoices/${id}/validate`));
});
server.tool("list_invoice_payments", "List payments for an invoice", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/invoices/${id}/payments`));
});
server.tool("list_invoice_credit_notes", "List credit notes linked to an invoice", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/invoices/${id}/credit-notes`));
});
server.tool("get_invoice_custom_fields", "Get custom fields of an invoice", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/invoices/${id}/custom-fields`));
});
server.tool("update_invoice_custom_fields", "Update custom fields of an invoice", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/invoices/${id}/custom-fields`, body));
});
server.tool("list_invoice_smart_tags", "List smart tags of an invoice", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/invoices/${id}/smart-tags`));
});
server.tool("compute_invoice", "Compute invoice totals", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/invoices/compute", body));
});

// =====================
// ESTIMATES (Devis)
// =====================
server.tool("list_estimates", "List estimates (devis)", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/estimates", null, { limit, offset }, e));
});
server.tool("get_estimate", "Get an estimate by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/estimates/${id}`, null, null, e));
});
server.tool("search_estimates", "Search estimates", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/estimates/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_estimate", "Create an estimate", { body: flexBody.describe("related_company (required), rows, date") }, async ({ body }) => {
  return r(await api("POST", "/estimates", body));
});
server.tool("update_estimate", "Update an estimate", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/estimates/${id}`, body));
});
server.tool("update_estimate_status", "Update estimate status (accepted, refused, etc.)", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/estimates/${id}/status`, body));
});
server.tool("send_estimate_esign", "Send estimate for e-signature", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("POST", `/estimates/${id}/esign`, body));
});
server.tool("list_estimate_payments", "List payments for an estimate", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/estimates/${id}/payments`));
});
server.tool("get_estimate_custom_fields", "Get custom fields of an estimate", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/estimates/${id}/custom-fields`));
});
server.tool("update_estimate_custom_fields", "Update custom fields of an estimate", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/estimates/${id}/custom-fields`, body));
});
server.tool("list_estimate_smart_tags", "List smart tags of an estimate", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/estimates/${id}/smart-tags`));
});
server.tool("compute_estimate", "Compute estimate totals", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/estimates/compute", body));
});

// =====================
// ORDERS (Bons de commande)
// =====================
server.tool("list_orders", "List orders", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/orders", null, { limit, offset }, e));
});
server.tool("get_order", "Get an order by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/orders/${id}`, null, null, e));
});
server.tool("search_orders", "Search orders", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/orders/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_order", "Create an order", { body: flexBody.describe("related_company (required), rows") }, async ({ body }) => {
  return r(await api("POST", "/orders", body));
});
server.tool("update_order", "Update an order", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/orders/${id}`, body));
});
server.tool("send_order_esign", "Send order for e-signature", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("POST", `/orders/${id}/esign`, body));
});
server.tool("list_order_payments", "List payments for an order", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/orders/${id}/payments`));
});
server.tool("get_order_custom_fields", "Get custom fields of an order", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/orders/${id}/custom-fields`));
});
server.tool("update_order_custom_fields", "Update custom fields of an order", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/orders/${id}/custom-fields`, body));
});
server.tool("list_order_smart_tags", "List smart tags of an order", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/orders/${id}/smart-tags`));
});
server.tool("compute_order", "Compute order totals", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/orders/compute", body));
});

// =====================
// CREDIT NOTES (Avoirs)
// =====================
server.tool("list_credit_notes", "List credit notes", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/credit-notes", null, { limit, offset }, e));
});
server.tool("get_credit_note", "Get a credit note by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/credit-notes/${id}`, null, null, e));
});
server.tool("search_credit_notes", "Search credit notes", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/credit-notes/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_credit_note", "Create a credit note", { body: flexBody.describe("related_company (required), rows") }, async ({ body }) => {
  return r(await api("POST", "/credit-notes", body));
});
server.tool("update_credit_note", "Update a credit note", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/credit-notes/${id}`, body));
});
server.tool("validate_credit_note", "Validate a credit note", { id: z.number() }, async ({ id }) => {
  return r(await api("PUT", `/credit-notes/${id}/validate`));
});
server.tool("list_credit_note_invoices", "List invoices linked to a credit note", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/credit-notes/${id}/invoices`));
});
server.tool("link_credit_note_to_invoice", "Link credit note to invoice", { creditNoteId: z.number(), invoiceId: z.number(), body: flexBody.optional() }, async ({ creditNoteId, invoiceId, body }) => {
  return r(await api("POST", `/credit-notes/${creditNoteId}/invoices/${invoiceId}`, body || {}));
});
server.tool("list_credit_note_payments", "List payments for a credit note", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/credit-notes/${id}/payments`));
});
server.tool("get_credit_note_custom_fields", "Get custom fields of a credit note", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/credit-notes/${id}/custom-fields`));
});
server.tool("list_credit_note_smart_tags", "List smart tags of a credit note", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/credit-notes/${id}/smart-tags`));
});
server.tool("compute_credit_note", "Compute credit note totals", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/credit-notes/compute", body));
});

// =====================
// DELIVERIES (Bons de livraison)
// =====================
server.tool("list_deliveries", "List deliveries", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/deliveries", null, { limit, offset }, e));
});
server.tool("get_delivery", "Get a delivery by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/deliveries/${id}`, null, null, e));
});
server.tool("search_deliveries", "Search deliveries", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/deliveries/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_delivery", "Create a delivery", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/deliveries", body));
});
server.tool("update_delivery", "Update a delivery", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/deliveries/${id}`, body));
});

// =====================
// DEPOSIT INVOICES (Factures d'acompte)
// =====================
server.tool("list_deposit_invoices", "List deposit invoices", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/deposit-invoices", null, { limit, offset }, e));
});
server.tool("get_deposit_invoice", "Get a deposit invoice by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/deposit-invoices/${id}`, null, null, e));
});
server.tool("search_deposit_invoices", "Search deposit invoices", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/deposit-invoices/search", { ...(filters || {}), limit, offset }));
});
server.tool("quick_create_deposit_invoice", "Quick-create a deposit invoice", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/deposit-invoices/quick-create", body));
});
server.tool("validate_deposit_invoice", "Validate a deposit invoice", { id: z.number() }, async ({ id }) => {
  return r(await api("PUT", `/deposit-invoices/${id}/validate`));
});
server.tool("list_deposit_invoice_payments", "List payments for a deposit invoice", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/deposit-invoices/${id}/payments`));
});
server.tool("list_deposit_invoice_credit_notes", "List credit notes for a deposit invoice", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/deposit-invoices/${id}/credit-notes`));
});
server.tool("get_deposit_invoice_custom_fields", "Get custom fields of a deposit invoice", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/deposit-invoices/${id}/custom-fields`));
});
server.tool("list_deposit_invoice_smart_tags", "List smart tags of a deposit invoice", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/deposit-invoices/${id}/smart-tags`));
});

// =====================
// PROGRESS INVOICES (Factures de situation)
// =====================
server.tool("get_progress_invoice", "Get a progress invoice by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/progress-invoices/${id}`));
});
server.tool("create_progress_invoice", "Create a progress invoice", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/progress-invoices", body));
});
server.tool("compute_progress_invoice", "Compute progress invoice totals", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/progress-invoices/compute", body));
});

// =====================
// OPPORTUNITIES (Deals)
// =====================
server.tool("list_opportunities", "List opportunities", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/opportunities", null, { limit, offset }, e));
});
server.tool("get_opportunity", "Get an opportunity by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/opportunities/${id}`, null, null, e));
});
server.tool("search_opportunities", "Search opportunities", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/opportunities/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_opportunity", "Create an opportunity", { body: flexBody.describe("name (required), pipeline_id, step_id, amount") }, async ({ body }) => {
  return r(await api("POST", "/opportunities", body));
});
server.tool("update_opportunity", "Update an opportunity", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/opportunities/${id}`, body));
});
server.tool("delete_opportunity", "Delete an opportunity", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/opportunities/${id}`));
});
server.tool("get_opportunity_custom_fields", "Get custom fields of an opportunity", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/opportunities/${id}/custom-fields`));
});
server.tool("update_opportunity_custom_fields", "Update custom fields of an opportunity", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/opportunities/${id}/custom-fields`, body));
});
server.tool("list_opportunity_smart_tags", "List smart tags of an opportunity", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/opportunities/${id}/smart-tags`));
});
server.tool("link_opportunity_smart_tags", "Link smart tags to an opportunity", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("POST", `/opportunities/${id}/smart-tags`, body));
});
server.tool("update_opportunity_step_rank", "Update step rank of an opportunity", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/opportunities/${id}/step-rank`, body));
});

// =====================
// PIPELINES & STEPS
// =====================
server.tool("list_pipelines", "List opportunity pipelines", {}, async () => {
  return r(await api("GET", "/opportunities/pipelines"));
});
server.tool("search_pipelines", "Search pipelines", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/opportunities/pipelines/search", { ...(filters || {}), limit, offset }));
});
server.tool("list_pipeline_steps", "List steps for a pipeline", { pipelineId: z.number() }, async ({ pipelineId }) => {
  return r(await api("GET", `/opportunities/pipelines/${pipelineId}/steps`));
});
server.tool("list_opportunity_categories", "List opportunity categories", {}, async () => {
  return r(await api("GET", "/opportunities/categories"));
});
server.tool("list_opportunity_sources", "List opportunity sources", {}, async () => {
  return r(await api("GET", "/opportunities/sources"));
});

// =====================
// ITEMS (Products/Services)
// =====================
server.tool("list_items", "List items (products and services)", { ...pagination, ...embed }, async ({ limit, offset, embed: e }) => {
  return r(await api("GET", "/items", null, { limit, offset }, e));
});
server.tool("get_item", "Get an item by ID", { id: z.number(), ...embed }, async ({ id, embed: e }) => {
  return r(await api("GET", `/items/${id}`, null, null, e));
});
server.tool("search_items", "Search items", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/items/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_item", "Create an item", { body: flexBody.describe("name (required), type, reference, unit_amount, tax_id") }, async ({ body }) => {
  return r(await api("POST", "/items", body));
});
server.tool("update_item", "Update an item", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/items/${id}`, body));
});
server.tool("delete_item", "Delete an item", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/items/${id}`));
});
server.tool("search_items_barcodes", "Search items by barcode", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/items/barcodes/search", { ...(filters || {}), limit, offset }));
});
server.tool("list_item_declinations", "List declinations of an item", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/items/${id}/declinations`));
});
server.tool("list_item_prices", "List prices for an item", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/items/${id}/prices`));
});

// =====================
// PAYMENTS
// =====================
server.tool("list_payments", "List payments", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/payments", null, { limit, offset }));
});
server.tool("get_payment", "Get a payment by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/payments/${id}`));
});
server.tool("search_payments", "Search payments", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/payments/search", { ...(filters || {}), limit, offset }));
});
server.tool("list_payment_methods", "List payment methods", {}, async () => {
  return r(await api("GET", "/payments/methods"));
});
server.tool("get_payment_method", "Get a payment method by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/payments/methods/${id}`));
});
server.tool("list_payment_terms", "List payment terms", {}, async () => {
  return r(await api("GET", "/payment-terms"));
});

// =====================
// COMMENTS
// =====================
server.tool("list_comments", "List comments", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/comments", null, { limit, offset }));
});
server.tool("get_comment", "Get a comment by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/comments/${id}`));
});
server.tool("create_comment", "Create a comment", { body: flexBody.describe("content (required), related_type, related_id") }, async ({ body }) => {
  return r(await api("POST", "/comments", body));
});
server.tool("update_comment", "Update a comment", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/comments/${id}`, body));
});
server.tool("delete_comment", "Delete a comment", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/comments/${id}`));
});
server.tool("search_comments", "Search comments", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/comments/search", { ...(filters || {}), limit, offset }));
});

// =====================
// TASKS (Taches CRM)
// =====================
server.tool("list_tasks", "List CRM tasks", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/tasks", null, { limit, offset }));
});
server.tool("get_task", "Get a task by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/tasks/${id}`));
});
server.tool("search_tasks", "Search tasks", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/tasks/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_task", "Create a task", { body: flexBody.describe("subject (required), due_date, related_type, related_id, assigned_to") }, async ({ body }) => {
  return r(await api("POST", "/tasks", body));
});
server.tool("update_task", "Update a task", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/tasks/${id}`, body));
});
server.tool("delete_task", "Delete a task", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/tasks/${id}`));
});
server.tool("list_task_labels", "List task labels", {}, async () => {
  return r(await api("GET", "/tasks/labels"));
});

// =====================
// CALENDAR EVENTS
// =====================
server.tool("list_calendar_events", "List calendar events", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/calendar-events", null, { limit, offset }));
});
server.tool("get_calendar_event", "Get a calendar event by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/calendar-events/${id}`));
});
server.tool("search_calendar_events", "Search calendar events", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/calendar-events/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_calendar_event", "Create a calendar event", { body: flexBody.describe("subject, start_date, end_date, related_type, related_id") }, async ({ body }) => {
  return r(await api("POST", "/calendar-events", body));
});
server.tool("update_calendar_event", "Update a calendar event", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/calendar-events/${id}`, body));
});
server.tool("delete_calendar_event", "Delete a calendar event", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/calendar-events/${id}`));
});
server.tool("list_calendar_event_labels", "List calendar event labels", {}, async () => {
  return r(await api("GET", "/calendar-events/labels"));
});

// =====================
// PHONE CALLS
// =====================
server.tool("list_phone_calls", "List phone calls", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/phone-calls", null, { limit, offset }));
});
server.tool("get_phone_call", "Get a phone call by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/phone-calls/${id}`));
});
server.tool("search_phone_calls", "Search phone calls", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/phone-calls/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_phone_call", "Create a phone call", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/phone-calls", body));
});
server.tool("update_phone_call", "Update a phone call", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/phone-calls/${id}`, body));
});
server.tool("delete_phone_call", "Delete a phone call", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/phone-calls/${id}`));
});

// =====================
// CUSTOM ACTIVITIES
// =====================
server.tool("list_custom_activities", "List custom activities", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/custom-activities", null, { limit, offset }));
});
server.tool("get_custom_activity", "Get a custom activity by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/custom-activities/${id}`));
});
server.tool("search_custom_activities", "Search custom activities", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/custom-activities/search", { ...(filters || {}), limit, offset }));
});
server.tool("create_custom_activity", "Create a custom activity", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/custom-activities", body));
});
server.tool("update_custom_activity", "Update a custom activity", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/custom-activities/${id}`, body));
});
server.tool("delete_custom_activity", "Delete a custom activity", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/custom-activities/${id}`));
});
server.tool("list_custom_activity_types", "List custom activity types", {}, async () => {
  return r(await api("GET", "/custom-activity-types"));
});

// =====================
// CRM ACTIVITIES (aggregated)
// =====================
server.tool("search_activities", "Search all CRM activities", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/activities/search", { ...(filters || {}), limit, offset }));
});
server.tool("search_crm_activities", "Search CRM activities (calls, emails, meetings)", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/activities/crm/search", { ...(filters || {}), limit, offset }));
});

// =====================
// EMAILS
// =====================
server.tool("send_email", "Send an email via Sellsy", { body: flexBody.describe("to, subject, body, related_type, related_id") }, async ({ body }) => {
  return r(await api("POST", "/email/send", body));
});
server.tool("list_email_templates", "List email templates", {}, async () => {
  return r(await api("GET", "/email/templates"));
});
server.tool("get_email_template", "Get an email template by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/email/templates/${id}`));
});
server.tool("get_email", "Get an email by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/emails/${id}`));
});

// =====================
// PROPOSALS
// =====================
server.tool("list_proposal_models", "List proposal models", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/proposals/models", null, { limit, offset }));
});
server.tool("get_proposal_model", "Get a proposal model by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/proposals/models/${id}`));
});
server.tool("generate_proposal_document", "Generate document from proposal model", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("POST", `/proposals/models/${id}/generate-document`, body));
});
server.tool("get_proposal_document", "Get a proposal document by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/proposals/documents/${id}`));
});

// =====================
// SUBSCRIPTIONS (Abonnements)
// =====================
server.tool("list_subscriptions", "List subscriptions", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/subscriptions", null, { limit, offset }));
});
server.tool("get_subscription", "Get a subscription by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/subscriptions/${id}`));
});
server.tool("search_subscriptions", "Search subscriptions", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/subscriptions/search", { ...(filters || {}), limit, offset }));
});

// =====================
// WEBHOOKS
// =====================
server.tool("list_webhooks", "List webhooks", {}, async () => {
  return r(await api("GET", "/webhooks"));
});
server.tool("create_webhook", "Create a webhook", { body: flexBody.describe("url (required), events (array)") }, async ({ body }) => {
  return r(await api("POST", "/webhooks", body));
});
server.tool("get_webhook", "Get a webhook by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/webhooks/${id}`));
});
server.tool("update_webhook", "Update a webhook", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("PUT", `/webhooks/${id}`, body));
});
server.tool("delete_webhook", "Delete a webhook", { id: z.number() }, async ({ id }) => {
  return r(await api("DELETE", `/webhooks/${id}`));
});
server.tool("list_webhook_events", "List available webhook events", {}, async () => {
  return r(await api("GET", "/webhooks/events"));
});

// =====================
// STAFFS
// =====================
server.tool("list_staffs", "List staff members", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/staffs", null, { limit, offset }));
});
server.tool("get_staff", "Get a staff member by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/staffs/${id}`));
});
server.tool("search_staffs", "Search staff members", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/staffs/search", { ...(filters || {}), limit, offset }));
});

// =====================
// CUSTOM FIELDS
// =====================
server.tool("list_custom_fields", "List custom field definitions", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/custom-fields", null, { limit, offset }));
});
server.tool("get_custom_field", "Get a custom field by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/custom-fields/${id}`));
});
server.tool("search_custom_fields", "Search custom fields", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/custom-fields/search", { ...(filters || {}), limit, offset }));
});

// =====================
// SMART TAGS
// =====================
server.tool("get_smart_tag", "Get a smart tag by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/smart-tags/${id}`));
});
server.tool("autocomplete_smart_tags", "Autocomplete smart tags", { linkedType: z.string().describe("Entity type"), query: z.string().optional() }, async ({ linkedType, query }) => {
  const p = {}; if (query) p.query = query;
  return r(await api("GET", `/smart-tags/${linkedType}/autocomplete`, null, p));
});

// =====================
// TAXES
// =====================
server.tool("list_taxes", "List taxes", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/taxes", null, { limit, offset }));
});
server.tool("get_tax", "Get a tax by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/taxes/${id}`));
});
server.tool("search_taxes", "Search taxes", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/taxes/search", { ...(filters || {}), limit, offset }));
});

// =====================
// DOCUMENT MODELS
// =====================
server.tool("list_document_models", "List document models/templates", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/documents/models", null, { limit, offset }));
});
server.tool("get_document_model", "Get a document model by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/documents/models/${id}`));
});
server.tool("search_document_models", "Search document models", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/documents/models/search", { ...(filters || {}), limit, offset }));
});

// =====================
// TIMELINE
// =====================
server.tool("search_timeline", "Search timeline events for an entity", { type: z.string().describe("Entity type"), id: z.number(), filters: flexBody.optional(), ...pagination }, async ({ type, id, filters, limit, offset }) => {
  return r(await api("POST", `/timeline/${type}/${id}/search`, { ...(filters || {}), limit, offset }));
});

// =====================
// BATCH
// =====================
server.tool("batch_request", "Execute multiple API requests in batch (max 10)", { requests: z.array(z.object({ method: z.string(), path: z.string(), body: z.any().optional() })) }, async ({ requests }) => {
  return r(await api("POST", "/batch", { requests }));
});

// =====================
// REFERENCE DATA
// =====================
server.tool("list_currencies", "List currencies", {}, async () => r(await api("GET", "/currencies")));
server.tool("list_countries", "List countries", {}, async () => r(await api("GET", "/countries")));
server.tool("list_languages", "List languages", {}, async () => r(await api("GET", "/languages")));
server.tool("list_units", "List units of measure", {}, async () => r(await api("GET", "/units")));
server.tool("list_rate_categories", "List rate categories", {}, async () => r(await api("GET", "/rate-categories")));
server.tool("list_teams", "List teams", {}, async () => r(await api("GET", "/teams")));
server.tool("list_document_layouts", "List document layouts", {}, async () => r(await api("GET", "/document-layouts")));
server.tool("list_profiles", "List profiles", {}, async () => r(await api("GET", "/profiles")));

// =====================
// GLOBAL SEARCH
// =====================
server.tool("global_search", "Search across all Sellsy entities", { query: z.string(), ...pagination }, async ({ query, limit, offset }) => {
  return r(await api("GET", "/search", null, { query, limit, offset }));
});

// =====================
// QUOTAS
// =====================
server.tool("get_quotas", "Get API quotas usage", {}, async () => {
  return r(await api("GET", "/quotas"));
});

// =====================
// NOTIFICATIONS
// =====================
server.tool("list_notifications", "List notifications", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/notifications", null, { limit, offset }));
});
server.tool("mark_all_notifications_read", "Mark all notifications as read", {}, async () => {
  return r(await api("POST", "/notifications/mark-all-as-read"));
});

// =====================
// FILES (on documents, companies, contacts, etc.)
// =====================
server.tool("list_company_files", "List files attached to a company", { companyId: z.number() }, async ({ companyId }) => {
  return r(await api("GET", `/companies/${companyId}/files`));
});
server.tool("list_contact_files", "List files attached to a contact", { contactId: z.number() }, async ({ contactId }) => {
  return r(await api("GET", `/contacts/${contactId}/files`));
});
server.tool("list_individual_files", "List files attached to an individual", { individualId: z.number() }, async ({ individualId }) => {
  return r(await api("GET", `/individuals/${individualId}/files`));
});
server.tool("list_invoice_files", "List files attached to an invoice", { documentId: z.number() }, async ({ documentId }) => {
  return r(await api("GET", `/invoices/${documentId}/files`));
});
server.tool("list_estimate_files", "List files attached to an estimate", { documentId: z.number() }, async ({ documentId }) => {
  return r(await api("GET", `/estimates/${documentId}/files`));
});
server.tool("list_order_files", "List files attached to an order", { documentId: z.number() }, async ({ documentId }) => {
  return r(await api("GET", `/orders/${documentId}/files`));
});
server.tool("list_credit_note_files", "List files attached to a credit note", { documentId: z.number() }, async ({ documentId }) => {
  return r(await api("GET", `/credit-notes/${documentId}/files`));
});
server.tool("list_deposit_invoice_files", "List files attached to a deposit invoice", { documentId: z.number() }, async ({ documentId }) => {
  return r(await api("GET", `/deposit-invoices/${documentId}/files`));
});
server.tool("list_opportunity_files", "List files attached to an opportunity", { opportunityId: z.number() }, async ({ opportunityId }) => {
  return r(await api("GET", `/opportunities/${opportunityId}/files`));
});
server.tool("list_directory_files", "List files in a directory", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/directories/${id}/files`));
});
server.tool("get_file", "Get a file by ID (metadata and download URL)", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/files/${id}`));
});

// =====================
// DISCOUNT INCL TAXES (Remises TTC on documents)
// =====================
server.tool("list_discount_incl_taxes", "List all discounts incl taxes", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/discount-incl-taxes", null, { limit, offset }));
});
server.tool("get_discount_incl_tax", "Get a discount incl tax by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/discount-incl-taxes/${id}`));
});
server.tool("get_invoice_discount", "Get a discount on an invoice", { invoiceId: z.number(), discountId: z.number() }, async ({ invoiceId, discountId }) => {
  return r(await api("GET", `/invoices/${invoiceId}/discount-incl-taxes/${discountId}`));
});
server.tool("create_invoice_discount", "Create a discount on an invoice", { invoiceId: z.number(), discountId: z.number(), body: flexBody }, async ({ invoiceId, discountId, body }) => {
  return r(await api("PUT", `/invoices/${invoiceId}/discount-incl-taxes/${discountId}`, body));
});
server.tool("delete_invoice_discount", "Delete a discount from an invoice", { invoiceId: z.number(), discountId: z.number() }, async ({ invoiceId, discountId }) => {
  return r(await api("DELETE", `/invoices/${invoiceId}/discount-incl-taxes/${discountId}`));
});
server.tool("get_estimate_discount", "Get a discount on an estimate", { estimateId: z.number(), discountId: z.number() }, async ({ estimateId, discountId }) => {
  return r(await api("GET", `/estimates/${estimateId}/discount-incl-taxes/${discountId}`));
});
server.tool("create_estimate_discount", "Create a discount on an estimate", { estimateId: z.number(), discountId: z.number(), body: flexBody }, async ({ estimateId, discountId, body }) => {
  return r(await api("PUT", `/estimates/${estimateId}/discount-incl-taxes/${discountId}`, body));
});
server.tool("delete_estimate_discount", "Delete a discount from an estimate", { estimateId: z.number(), discountId: z.number() }, async ({ estimateId, discountId }) => {
  return r(await api("DELETE", `/estimates/${estimateId}/discount-incl-taxes/${discountId}`));
});
server.tool("get_order_discount", "Get a discount on an order", { orderId: z.number(), discountId: z.number() }, async ({ orderId, discountId }) => {
  return r(await api("GET", `/orders/${orderId}/discount-incl-taxes/${discountId}`));
});
server.tool("create_order_discount", "Create a discount on an order", { orderId: z.number(), discountId: z.number(), body: flexBody }, async ({ orderId, discountId, body }) => {
  return r(await api("PUT", `/orders/${orderId}/discount-incl-taxes/${discountId}`, body));
});
server.tool("delete_order_discount", "Delete a discount from an order", { orderId: z.number(), discountId: z.number() }, async ({ orderId, discountId }) => {
  return r(await api("DELETE", `/orders/${orderId}/discount-incl-taxes/${discountId}`));
});
server.tool("get_credit_note_discount", "Get a discount on a credit note", { creditNoteId: z.number(), discountId: z.number() }, async ({ creditNoteId, discountId }) => {
  return r(await api("GET", `/credit-notes/${creditNoteId}/discount-incl-taxes/${discountId}`));
});
server.tool("create_credit_note_discount", "Create a discount on a credit note", { creditNoteId: z.number(), discountId: z.number(), body: flexBody }, async ({ creditNoteId, discountId, body }) => {
  return r(await api("PUT", `/credit-notes/${creditNoteId}/discount-incl-taxes/${discountId}`, body));
});
server.tool("delete_credit_note_discount", "Delete a discount from a credit note", { creditNoteId: z.number(), discountId: z.number() }, async ({ creditNoteId, discountId }) => {
  return r(await api("DELETE", `/credit-notes/${creditNoteId}/discount-incl-taxes/${discountId}`));
});

// =====================
// PRIMES (on documents)
// =====================
server.tool("list_primes", "List all primes", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/primes", null, { limit, offset }));
});
server.tool("get_invoice_prime", "Get a prime on an invoice", { invoiceId: z.number(), primeId: z.number() }, async ({ invoiceId, primeId }) => {
  return r(await api("GET", `/invoices/${invoiceId}/primes/${primeId}`));
});
server.tool("set_invoice_prime", "Set a prime on an invoice", { invoiceId: z.number(), primeId: z.number(), body: flexBody }, async ({ invoiceId, primeId, body }) => {
  return r(await api("PUT", `/invoices/${invoiceId}/primes/${primeId}`, body));
});
server.tool("delete_invoice_prime", "Delete a prime from an invoice", { invoiceId: z.number(), primeId: z.number() }, async ({ invoiceId, primeId }) => {
  return r(await api("DELETE", `/invoices/${invoiceId}/primes/${primeId}`));
});
server.tool("get_estimate_prime", "Get a prime on an estimate", { estimateId: z.number(), primeId: z.number() }, async ({ estimateId, primeId }) => {
  return r(await api("GET", `/estimates/${estimateId}/primes/${primeId}`));
});
server.tool("set_estimate_prime", "Set a prime on an estimate", { estimateId: z.number(), primeId: z.number(), body: flexBody }, async ({ estimateId, primeId, body }) => {
  return r(await api("PUT", `/estimates/${estimateId}/primes/${primeId}`, body));
});
server.tool("delete_estimate_prime", "Delete a prime from an estimate", { estimateId: z.number(), primeId: z.number() }, async ({ estimateId, primeId }) => {
  return r(await api("DELETE", `/estimates/${estimateId}/primes/${primeId}`));
});
server.tool("get_order_prime", "Get a prime on an order", { orderId: z.number(), primeId: z.number() }, async ({ orderId, primeId }) => {
  return r(await api("GET", `/orders/${orderId}/primes/${primeId}`));
});
server.tool("set_order_prime", "Set a prime on an order", { orderId: z.number(), primeId: z.number(), body: flexBody }, async ({ orderId, primeId, body }) => {
  return r(await api("PUT", `/orders/${orderId}/primes/${primeId}`, body));
});
server.tool("delete_order_prime", "Delete a prime from an order", { orderId: z.number(), primeId: z.number() }, async ({ orderId, primeId }) => {
  return r(await api("DELETE", `/orders/${orderId}/primes/${primeId}`));
});
server.tool("get_credit_note_prime", "Get a prime on a credit note", { creditNoteId: z.number(), primeId: z.number() }, async ({ creditNoteId, primeId }) => {
  return r(await api("GET", `/credit-notes/${creditNoteId}/primes/${primeId}`));
});
server.tool("set_credit_note_prime", "Set a prime on a credit note", { creditNoteId: z.number(), primeId: z.number(), body: flexBody }, async ({ creditNoteId, primeId, body }) => {
  return r(await api("PUT", `/credit-notes/${creditNoteId}/primes/${primeId}`, body));
});
server.tool("delete_credit_note_prime", "Delete a prime from a credit note", { creditNoteId: z.number(), primeId: z.number() }, async ({ creditNoteId, primeId }) => {
  return r(await api("DELETE", `/credit-notes/${creditNoteId}/primes/${primeId}`));
});

// =====================
// DOCUMENT PAYMENT LINKS (link/unlink payments on documents)
// =====================
server.tool("link_invoice_payment", "Link a payment to an invoice", { documentId: z.number(), paymentId: z.number(), body: flexBody.optional() }, async ({ documentId, paymentId, body }) => {
  return r(await api("POST", `/invoices/${documentId}/payments/${paymentId}`, body || {}));
});
server.tool("unlink_invoice_payment", "Unlink a payment from an invoice", { documentId: z.number(), paymentId: z.number() }, async ({ documentId, paymentId }) => {
  return r(await api("DELETE", `/invoices/${documentId}/payments/${paymentId}`));
});
server.tool("link_estimate_payment", "Link a payment to an estimate", { documentId: z.number(), paymentId: z.number(), body: flexBody.optional() }, async ({ documentId, paymentId, body }) => {
  return r(await api("POST", `/estimates/${documentId}/payments/${paymentId}`, body || {}));
});
server.tool("unlink_estimate_payment", "Unlink a payment from an estimate", { documentId: z.number(), paymentId: z.number() }, async ({ documentId, paymentId }) => {
  return r(await api("DELETE", `/estimates/${documentId}/payments/${paymentId}`));
});
server.tool("link_order_payment", "Link a payment to an order", { documentId: z.number(), paymentId: z.number(), body: flexBody.optional() }, async ({ documentId, paymentId, body }) => {
  return r(await api("POST", `/orders/${documentId}/payments/${paymentId}`, body || {}));
});
server.tool("unlink_order_payment", "Unlink a payment from an order", { documentId: z.number(), paymentId: z.number() }, async ({ documentId, paymentId }) => {
  return r(await api("DELETE", `/orders/${documentId}/payments/${paymentId}`));
});
server.tool("link_credit_note_payment", "Link a payment to a credit note", { documentId: z.number(), paymentId: z.number(), body: flexBody.optional() }, async ({ documentId, paymentId, body }) => {
  return r(await api("POST", `/credit-notes/${documentId}/payments/${paymentId}`, body || {}));
});
server.tool("unlink_credit_note_payment", "Unlink a payment from a credit note", { documentId: z.number(), paymentId: z.number() }, async ({ documentId, paymentId }) => {
  return r(await api("DELETE", `/credit-notes/${documentId}/payments/${paymentId}`));
});
server.tool("link_deposit_invoice_payment", "Link a payment to a deposit invoice", { documentId: z.number(), paymentId: z.number(), body: flexBody.optional() }, async ({ documentId, paymentId, body }) => {
  return r(await api("POST", `/deposit-invoices/${documentId}/payments/${paymentId}`, body || {}));
});
server.tool("unlink_deposit_invoice_payment", "Unlink a payment from a deposit invoice", { documentId: z.number(), paymentId: z.number() }, async ({ documentId, paymentId }) => {
  return r(await api("DELETE", `/deposit-invoices/${documentId}/payments/${paymentId}`));
});

// =====================
// INVOICE <-> CREDIT NOTE links
// =====================
server.tool("link_invoice_credit_note", "Link a credit note to an invoice", { invoiceId: z.number(), creditNoteId: z.number(), body: flexBody.optional() }, async ({ invoiceId, creditNoteId, body }) => {
  return r(await api("POST", `/invoices/${invoiceId}/credit-notes/${creditNoteId}`, body || {}));
});
server.tool("unlink_invoice_credit_note", "Unlink a credit note from an invoice", { invoiceId: z.number(), creditNoteId: z.number() }, async ({ invoiceId, creditNoteId }) => {
  return r(await api("DELETE", `/invoices/${invoiceId}/credit-notes/${creditNoteId}`));
});

// =====================
// SUBSCRIPTION PAYMENT INSTALLMENTS
// =====================
server.tool("list_payment_installments", "List all payment installments", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/subscriptions/payment-installments", null, { limit, offset }));
});
server.tool("search_payment_installments", "Search payment installments", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/subscriptions/payment-installments/search", { ...(filters || {}), limit, offset }));
});
server.tool("list_subscription_installments", "List payment installments for a subscription", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/subscriptions/${id}/payment-installments`));
});

// =====================
// OCR (Factures fournisseurs)
// =====================
server.tool("list_ocr_invoices", "List OCR purchase invoices", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/ocr/pur-invoice", null, { limit, offset }));
});
server.tool("create_ocr_invoice", "Upload and create an OCR purchase invoice", { body: flexBody.describe("File upload data for OCR processing") }, async ({ body }) => {
  return r(await api("POST", "/ocr/pur-invoice", body));
});
server.tool("search_ocr_invoices", "Search OCR purchase invoices", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/ocr/pur-invoice/search", { ...(filters || {}), limit, offset }));
});
server.tool("get_ocr_invoice_metas", "Get OCR purchase invoice metadata/schema", {}, async () => {
  return r(await api("GET", "/ocr/pur-invoice/metas"));
});

// =====================
// INDIVIDUALS - missing sub-endpoints
// =====================
server.tool("list_individual_contacts", "List contacts linked to an individual", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/individuals/${id}/contacts`));
});
server.tool("link_contact_to_individual", "Link a contact to an individual", { individualId: z.number(), contactId: z.number(), body: flexBody.optional() }, async ({ individualId, contactId, body }) => {
  return r(await api("POST", `/individuals/${individualId}/contacts/${contactId}`, body || {}));
});
server.tool("unlink_contact_from_individual", "Unlink a contact from an individual", { individualId: z.number(), contactId: z.number() }, async ({ individualId, contactId }) => {
  return r(await api("DELETE", `/individuals/${individualId}/contacts/${contactId}`));
});
server.tool("record_individual_payment", "Record a payment for an individual", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("POST", `/individuals/${id}/payments`, body));
});

// =====================
// FAVOURITE FILTERS (on various entities)
// =====================
server.tool("list_contact_favourite_filters", "List contact favourite filters", {}, async () => {
  return r(await api("GET", "/contacts/favourite-filters"));
});
server.tool("list_individual_favourite_filters", "List individual favourite filters", {}, async () => {
  return r(await api("GET", "/individuals/favourite-filters"));
});
server.tool("list_invoice_favourite_filters", "List invoice favourite filters", {}, async () => {
  return r(await api("GET", "/invoices/favourite-filters"));
});
server.tool("list_estimate_favourite_filters", "List estimate favourite filters", {}, async () => {
  return r(await api("GET", "/estimates/favourite-filters"));
});
server.tool("list_order_favourite_filters", "List order favourite filters", {}, async () => {
  return r(await api("GET", "/orders/favourite-filters"));
});
server.tool("list_credit_note_favourite_filters", "List credit note favourite filters", {}, async () => {
  return r(await api("GET", "/credit-notes/favourite-filters"));
});
server.tool("list_opportunity_favourite_filters", "List opportunity favourite filters", {}, async () => {
  return r(await api("GET", "/opportunities/favourite-filters"));
});
server.tool("list_item_favourite_filters", "List item favourite filters", {}, async () => {
  return r(await api("GET", "/items/favourite-filters"));
});

// =====================
// ACCOUNTING
// =====================
server.tool("list_accounting_codes", "List accounting codes", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/accounting-codes", null, { limit, offset }));
});
server.tool("get_accounting_code", "Get an accounting code by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/accounting-codes/${id}`));
});
server.tool("search_accounting_codes", "Search accounting codes", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/accounting-codes/search", { ...(filters || {}), limit, offset }));
});
server.tool("get_accounting_journal", "Get accounting journal by type", { type: z.string().describe("Journal type (sales, purchases, etc.)"), ...pagination }, async ({ type, limit, offset }) => {
  return r(await api("GET", `/accounting-journal/${type}`, null, { limit, offset }));
});
server.tool("search_accounting_journal", "Search accounting journal entries", { type: z.string(), filters: flexBody.optional(), ...pagination }, async ({ type, filters, limit, offset }) => {
  return r(await api("POST", `/accounting-journal/${type}/search`, { ...(filters || {}), limit, offset }));
});
server.tool("get_accounting_journal_metas", "Get accounting journal metadata", { type: z.string() }, async ({ type }) => {
  return r(await api("GET", `/accounting-journal/${type}/metas`));
});
server.tool("export_accounting_journal", "Export accounting journal", { type: z.string(), body: flexBody.optional() }, async ({ type, body }) => {
  return r(await api("POST", `/accounting-journal/${type}/export`, body || {}));
});
server.tool("list_tax_accounting_codes", "List accounting codes for a tax", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/taxes/${id}/accounting-codes`));
});
server.tool("list_all_tax_accounting_codes", "List all tax accounting codes", {}, async () => {
  return r(await api("GET", "/taxes/accounting-codes"));
});
server.tool("list_fiscal_years", "List fiscal years", {}, async () => {
  return r(await api("GET", "/fiscal-years"));
});
server.tool("get_accounting_charts", "Get accounting chart settings", {}, async () => {
  return r(await api("GET", "/settings/accounting-charts"));
});

// =====================
// NOTIFICATIONS - extended
// =====================
server.tool("get_notification", "Get a notification by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/notifications/${id}`));
});
server.tool("mark_notification_read", "Mark a single notification as read", { id: z.number() }, async ({ id }) => {
  return r(await api("POST", `/notifications/${id}/mark-as-read`));
});
server.tool("search_notifications", "Search notifications", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/notifications/search", { ...(filters || {}), limit, offset }));
});
server.tool("get_notification_settings", "Get notification settings", {}, async () => {
  return r(await api("GET", "/notifications/settings"));
});

// =====================
// PROPOSALS - extended
// =====================
server.tool("search_proposal_models", "Search proposal models", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/proposals/models/search", { ...(filters || {}), limit, offset }));
});
server.tool("send_proposal_document_esign", "Send a proposal document for e-signature", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("POST", `/proposals/documents/${id}/esign`, body));
});

// =====================
// EMAILS - extended
// =====================
server.tool("upload_email_attachment", "Upload an email attachment", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/email/attachment", body));
});
server.tool("authenticate_email", "Authenticate email domain", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/email/authenticate", body));
});
server.tool("validate_email_domain", "Validate email domain", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/email/domain/validate", body));
});
server.tool("get_email_system_templates", "Get system email templates by context", { context: z.string() }, async ({ context }) => {
  return r(await api("GET", `/email/system-templates/${context}`));
});
server.tool("list_email_template_tags", "List available email template tags", {}, async () => {
  return r(await api("GET", "/email/templates/tags"));
});
server.tool("get_email_thread", "Get an email thread by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/emails/threads/${id}`));
});

// =====================
// DOCUMENT MODELS - extended
// =====================
server.tool("list_document_model_tags", "List document model tags", {}, async () => {
  return r(await api("GET", "/documents/models/tags"));
});
server.tool("convert_document_model", "Convert a document model", { id: z.number(), body: flexBody }, async ({ id, body }) => {
  return r(await api("POST", `/documents/models/${id}/convert`, body));
});

// =====================
// PIPELINES & STEPS - extended
// =====================
server.tool("search_pipeline_steps", "Search steps within a pipeline", { pipelineId: z.number(), filters: flexBody.optional(), ...pagination }, async ({ pipelineId, filters, limit, offset }) => {
  return r(await api("POST", `/opportunities/pipelines/${pipelineId}/steps/search`, { ...(filters || {}), limit, offset }));
});
server.tool("search_all_steps", "Search all pipeline steps", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/opportunities/steps/search", { ...(filters || {}), limit, offset }));
});
server.tool("get_opportunity_category", "Get an opportunity category by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/opportunities/categories/${id}`));
});
server.tool("list_category_sources", "List sources for an opportunity category", { sourceCategoryId: z.number() }, async ({ sourceCategoryId }) => {
  return r(await api("GET", `/opportunities/categories/${sourceCategoryId}/sources`));
});
server.tool("search_opportunity_sources", "Search opportunity sources", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/opportunities/sources/search", { ...(filters || {}), limit, offset }));
});

// =====================
// ITEMS - extended
// =====================
server.tool("list_item_declination_prices", "List prices for an item declination", { id: z.number(), declinationId: z.number() }, async ({ id, declinationId }) => {
  return r(await api("GET", `/items/${id}/declinations/${declinationId}/prices`));
});

// =====================
// MISCELLANEOUS (remaining endpoints)
// =====================
server.tool("list_addresses", "List all addresses", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/addresses", null, { limit, offset }));
});
server.tool("list_bank_accounts", "List bank accounts", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/bank-accounts", null, { limit, offset }));
});
server.tool("list_mandates", "List SEPA mandates", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/mandates", null, { limit, offset }));
});
server.tool("search_mandates", "Search SEPA mandates", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/mandates/search", { ...(filters || {}), limit, offset }));
});
server.tool("list_directories", "List directories", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/directories", null, { limit, offset }));
});
server.tool("get_directory", "Get a directory by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/directories/${id}`));
});
server.tool("list_clients", "List clients", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/clients", null, { limit, offset }));
});
server.tool("get_client", "Get a client by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/clients/${id}`));
});
server.tool("list_scopes", "List scopes (permissions)", {}, async () => {
  return r(await api("GET", "/scopes"));
});
server.tool("get_scopes_tree", "Get scopes tree (permissions hierarchy)", {}, async () => {
  return r(await api("GET", "/scopes/tree"));
});
server.tool("get_staff_licenses", "Get licenses for a staff member", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/staffs/${id}/licenses`));
});
server.tool("get_rate_category", "Get a rate category by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/rate-categories/${id}`));
});
server.tool("list_assigned_staff_labels", "List assigned staff labels", {}, async () => {
  return r(await api("GET", "/assigned-staff-labels"));
});
server.tool("list_check_labels", "List check labels", {}, async () => {
  return r(await api("GET", "/check-labels"));
});
server.tool("get_accounts_conformities", "Get account conformities", {}, async () => {
  return r(await api("GET", "/accounts/conformities"));
});
server.tool("get_accounts_documents", "Get account documents", {}, async () => {
  return r(await api("GET", "/accounts/documents"));
});
server.tool("search_payment_methods", "Search payment methods", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/payments/methods/search", { ...(filters || {}), limit, offset }));
});
server.tool("search_webhooks", "Search webhooks", { filters: flexBody.optional(), ...pagination }, async ({ filters, limit, offset }) => {
  return r(await api("POST", "/webhooks/search", { ...(filters || {}), limit, offset }));
});
server.tool("list_crm_activities", "List CRM activities", { ...pagination }, async ({ limit, offset }) => {
  return r(await api("GET", "/activities/crm", null, { limit, offset }));
});
server.tool("export_crm_activities", "Export CRM activities", { body: flexBody.optional() }, async ({ body }) => {
  return r(await api("POST", "/activities/crm/export", body || {}));
});
server.tool("get_crm_activities_metas", "Get CRM activities metadata", {}, async () => {
  return r(await api("GET", "/activities/crm/metas"));
});
server.tool("get_custom_activity_type", "Get a custom activity type by ID", { id: z.number() }, async ({ id }) => {
  return r(await api("GET", `/custom-activity-types/${id}`));
});
server.tool("prepare_deposit_invoice", "Prepare a deposit invoice", { body: flexBody }, async ({ body }) => {
  return r(await api("POST", "/deposit-invoices/prepare", body));
});

// =====================
// SETTINGS
// =====================
server.tool("get_email_settings", "Get email settings", {}, async () => {
  return r(await api("GET", "/settings/email"));
});
server.tool("list_email_settings_tags", "List email settings tags", {}, async () => {
  return r(await api("GET", "/settings/email/tags"));
});
server.tool("get_subscription_settings", "Get subscription settings", {}, async () => {
  return r(await api("GET", "/settings/subscription"));
});

// =====================
// GENERIC API CALL
// =====================
server.tool(
  "sellsy_api_request",
  "Raw API request to any Sellsy v2 endpoint not covered by other tools",
  {
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
    path: z.string().describe("API path (e.g. /companies/{id}/files)"),
    body: flexBody.optional(),
    params: z.object({}).passthrough().optional(),
  },
  async ({ method, path, body, params }) => {
    return r(await api(method, path, body || null, params || null));
  }
);

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
