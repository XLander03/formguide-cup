# Blocked / failed downloads

| Form | URL | Reason |
|------|-----|--------|
| SBI Account Opening (Resident Individual) | https://sbi.bank.in/documents/26274/3200842/041122-Account+Opening+Form.pdf/f342f6b0-e8f6-ac55-951d-2ca7179bc2d7?t=1667552399747 | WAF "Request Rejected" (HTML support ID returned; Cloudflare/bot protection) |
| SBI Customer Request Form (English) | https://sbi.bank.in/documents/53471/263971/Customer+Request+Form-English.pdf/073e1162-e578-b106-eba6-d8145997ece3?t=1763105099808 | WAF "Request Rejected" |
| SBI Nomination DA-1 | https://retail.sbi.bank.in/sbi/downloads/da1.pdf | Redirects to YONO login/welcome (auth wall), not a public PDF |
| StockHolding CKYC Individual | https://www.stockholding.com/pdf/Know-Your-Customer-(KYC)-Application-Form-Individual.pdf | WAF "Request Rejected" (403) |
| ITD Form 15G | https://www.incometaxindia.gov.in/documents/d/guest/103120000000007845-pdf-5 | Access Denied (403 Akamai) from this egress |
| ITD Form 121 guide | https://www.incometaxindia.gov.in/documents/d/guest/fn-121 | Access Denied (403) |
| ITD Form 60/61 (97/98) | https://www.incometaxindia.gov.in/documents/d/guest/english-form-60n-and-61n-on-18-03-2026-pdf | Access Denied (403) |
| ITD Form 15G alt path | https://www.incometaxindia.gov.in/forms/income-tax%20rules/103120000000007845.pdf | Access Denied (403) |

Note: Bank-hosted Form 121 (HDFC, ICICI) downloaded successfully as practical substitutes for ITD Form 121 / legacy 15G-15H.
