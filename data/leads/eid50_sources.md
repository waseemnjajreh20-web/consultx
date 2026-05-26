# EID50 Campaign — Lead Sources

## Primary Official Sources

### 1. Saudi Council of Engineers (SCE) — Office Search
- URL: https://www.saudieng.sa/Arabic/Inquiry/Pages/OfficeSearch.aspx
- Type: Official government registry of licensed engineering offices in Saudi Arabia
- Data: Office name, license number, city, contact info
- Notes: Requires CAPTCHA; best approached via manual search or official data request
- Priority: HIGH

### 2. Balady — Engineering Offices Inquiry
- URL: https://apps.balady.gov.sa/Eservices/Inquiries/InquiryEngOffices
- Type: Municipal engineering office registry
- Data: Office name, city, classification, contact info
- Notes: Official government portal; may require CAPTCHA
- Priority: HIGH

### 3. Balady — Service Page
- URL: https://balady.gov.sa/ar/services/الاستعلام-عن-المكاتب-الهندسية
- Type: Service information page
- Notes: Information page about the inquiry service
- Priority: MEDIUM

### 4. Sakani — Certified Engineering Offices
- URL: https://sakani.sa/app/certified-engineering-offices
- Type: Official certified office listing
- Data: Office name, city, status
- Priority: HIGH

### 5. MODON — Qualified Engineering Offices
- URL: https://modon.gov.sa (search for qualified engineering offices list)
- Type: Official industrial cities authority listing
- Data: Qualified engineering office list (often published as PDF)
- Priority: HIGH

## Secondary Sources

### 6. Google Places API
- Type: Commercial business listing data
- Queries: engineering offices in 18 major KSA cities
- Search phrases in English and Arabic
- Requires API key from environment
- Priority: MEDIUM

### 7. Manual/Curated Lists
- Chamber of commerce directories
- Industry association directories
- Public tender participant lists
- Priority: LOW

## Search Cities (Google Places)
Riyadh, Jeddah, Makkah, Madinah, Dammam, Khobar, Dhahran, Tabuk, Abha,
Khamis Mushait, Taif, Buraydah, Hail, Jazan, Najran, Al Ahsa, Jubail, Yanbu

## Search Phrases (Google Places)
- "engineering consulting office"
- "مكتب استشارات هندسية"
- "مكتب هندسي"
- "fire safety consultant"
- "استشارات سلامة"
- "مكتب سلامة هندسية"
- "architectural engineering consultant"

## Email Extraction Priority
1. Official website contact page email
2. info@, contact@, office@, sales@, admin@, engineering@
3. Public company email from official registry
4. Personal emails ONLY if they are the only public contact AND source is official

## Exclusions
- Obvious personal/private emails (Gmail, Yahoo, Hotmail, etc.) if an official company email exists
- Duplicates by email and by domain
- Emails without a source URL
- Non-KSA offices
