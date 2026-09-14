
export interface Country {
  name: string;
  dial_code: string;
  code: string;
}

const countryCodes: Country[] = [
  {
    "name": "United States",
    "dial_code": "+1",
    "code": "US"
  },
  {
    "name": "United Kingdom",
    "dial_code": "+44",
    "code": "GB"
  },
  {
    "name": "Canada",
    "dial_code": "+1",
    "code": "CA"
  },
  {
    "name": "Australia",
    "dial_code": "+61",
    "code": "AU"
  },
  {
    "name": "Brazil",
    "dial_code": "+55",
    "code": "BR"
  },
  {
    "name": "China",
    "dial_code": "+86",
    "code": "CN"
  },
  {
    "name": "France",
    "dial_code": "+33",
    "code": "FR"
  },
  {
    "name": "Germany",
    "dial_code": "+49",
    "code": "DE"
  },
  {
    "name": "India",
    "dial_code": "+91",
    "code": "IN"
  },
  {
    "name": "Indonesia",
    "dial_code": "+62",
    "code": "ID"
  },
  {
    "name": "Italy",
    "dial_code": "+39",
    "code": "IT"
  },
  {
    "name": "Japan",
    "dial_code": "+81",
    "code": "JP"
  },
  {
    "name": "Mexico",
    "dial_code": "+52",
    "code": "MX"
  },
  {
    "name": "Nigeria",
    "dial_code": "+234",
    "code": "NG"
  },
  {
    "name": "Pakistan",
    "dial_code": "+92",
    "code": "PK"
  },
  {
    "name": "Russia",
    "dial_code": "+7",
    "code": "RU"
  },
  {
    "name": "South Africa",
    "dial_code": "+27",
    "code": "ZA"
  },
  {
    "name": "South Korea",
    "dial_code": "+82",
    "code": "KR"
  },
  {
    "name": "Spain",
    "dial_code": "+34",
    "code": "ES"
  },
  {
    "name": "Turkey",
    "dial_code": "+90",
    "code": "TR"
  },

  // European Union member states not already listed above.
  { "name": "Austria", "dial_code": "+43", "code": "AT" },
  { "name": "Belgium", "dial_code": "+32", "code": "BE" },
  { "name": "Bulgaria", "dial_code": "+359", "code": "BG" },
  { "name": "Croatia", "dial_code": "+385", "code": "HR" },
  { "name": "Cyprus", "dial_code": "+357", "code": "CY" },
  { "name": "Czech Republic", "dial_code": "+420", "code": "CZ" },
  { "name": "Denmark", "dial_code": "+45", "code": "DK" },
  { "name": "Estonia", "dial_code": "+372", "code": "EE" },
  { "name": "Finland", "dial_code": "+358", "code": "FI" },
  { "name": "Greece", "dial_code": "+30", "code": "GR" },
  { "name": "Hungary", "dial_code": "+36", "code": "HU" },
  { "name": "Ireland", "dial_code": "+353", "code": "IE" },
  { "name": "Latvia", "dial_code": "+371", "code": "LV" },
  { "name": "Lithuania", "dial_code": "+370", "code": "LT" },
  { "name": "Luxembourg", "dial_code": "+352", "code": "LU" },
  { "name": "Malta", "dial_code": "+356", "code": "MT" },
  { "name": "Netherlands", "dial_code": "+31", "code": "NL" },
  { "name": "Poland", "dial_code": "+48", "code": "PL" },
  { "name": "Portugal", "dial_code": "+351", "code": "PT" },
  { "name": "Romania", "dial_code": "+40", "code": "RO" },
  { "name": "Slovakia", "dial_code": "+421", "code": "SK" },
  { "name": "Slovenia", "dial_code": "+386", "code": "SI" },
  { "name": "Sweden", "dial_code": "+46", "code": "SE" },

  // Rest of Europe / EEA.
  { "name": "Switzerland", "dial_code": "+41", "code": "CH" },
  { "name": "Norway", "dial_code": "+47", "code": "NO" },
  { "name": "Iceland", "dial_code": "+354", "code": "IS" },
  { "name": "Liechtenstein", "dial_code": "+423", "code": "LI" },
  { "name": "Ukraine", "dial_code": "+380", "code": "UA" },
  { "name": "Serbia", "dial_code": "+381", "code": "RS" },
  { "name": "Albania", "dial_code": "+355", "code": "AL" },
  { "name": "Bosnia and Herzegovina", "dial_code": "+387", "code": "BA" },
  { "name": "North Macedonia", "dial_code": "+389", "code": "MK" },
  { "name": "Montenegro", "dial_code": "+382", "code": "ME" },
  { "name": "Moldova", "dial_code": "+373", "code": "MD" },
  { "name": "Belarus", "dial_code": "+375", "code": "BY" },
  { "name": "Monaco", "dial_code": "+377", "code": "MC" },
  { "name": "Andorra", "dial_code": "+376", "code": "AD" },
  { "name": "San Marino", "dial_code": "+378", "code": "SM" },

  // Americas.
  { "name": "Argentina", "dial_code": "+54", "code": "AR" },
  { "name": "Chile", "dial_code": "+56", "code": "CL" },
  { "name": "Colombia", "dial_code": "+57", "code": "CO" },
  { "name": "Peru", "dial_code": "+51", "code": "PE" },
  { "name": "Venezuela", "dial_code": "+58", "code": "VE" },
  { "name": "Ecuador", "dial_code": "+593", "code": "EC" },
  { "name": "Bolivia", "dial_code": "+591", "code": "BO" },
  { "name": "Paraguay", "dial_code": "+595", "code": "PY" },
  { "name": "Uruguay", "dial_code": "+598", "code": "UY" },
  { "name": "Costa Rica", "dial_code": "+506", "code": "CR" },
  { "name": "Panama", "dial_code": "+507", "code": "PA" },
  { "name": "Guatemala", "dial_code": "+502", "code": "GT" },
  { "name": "Honduras", "dial_code": "+504", "code": "HN" },
  { "name": "El Salvador", "dial_code": "+503", "code": "SV" },
  { "name": "Nicaragua", "dial_code": "+505", "code": "NI" },
  { "name": "Dominican Republic", "dial_code": "+1", "code": "DO" },
  { "name": "Cuba", "dial_code": "+53", "code": "CU" },
  { "name": "Jamaica", "dial_code": "+1", "code": "JM" },
  { "name": "Trinidad and Tobago", "dial_code": "+1", "code": "TT" },

  // Asia-Pacific.
  { "name": "Singapore", "dial_code": "+65", "code": "SG" },
  { "name": "Malaysia", "dial_code": "+60", "code": "MY" },
  { "name": "Thailand", "dial_code": "+66", "code": "TH" },
  { "name": "Vietnam", "dial_code": "+84", "code": "VN" },
  { "name": "Philippines", "dial_code": "+63", "code": "PH" },
  { "name": "Taiwan", "dial_code": "+886", "code": "TW" },
  { "name": "Hong Kong", "dial_code": "+852", "code": "HK" },
  { "name": "Bangladesh", "dial_code": "+880", "code": "BD" },
  { "name": "Sri Lanka", "dial_code": "+94", "code": "LK" },
  { "name": "New Zealand", "dial_code": "+64", "code": "NZ" },
  { "name": "Nepal", "dial_code": "+977", "code": "NP" },
  { "name": "Myanmar", "dial_code": "+95", "code": "MM" },
  { "name": "Cambodia", "dial_code": "+855", "code": "KH" },
  { "name": "Laos", "dial_code": "+856", "code": "LA" },
  { "name": "Mongolia", "dial_code": "+976", "code": "MN" },
  { "name": "Kazakhstan", "dial_code": "+7", "code": "KZ" },
  { "name": "Uzbekistan", "dial_code": "+998", "code": "UZ" },

  // Middle East.
  { "name": "Saudi Arabia", "dial_code": "+966", "code": "SA" },
  { "name": "United Arab Emirates", "dial_code": "+971", "code": "AE" },
  { "name": "Israel", "dial_code": "+972", "code": "IL" },
  { "name": "Qatar", "dial_code": "+974", "code": "QA" },
  { "name": "Kuwait", "dial_code": "+965", "code": "KW" },
  { "name": "Bahrain", "dial_code": "+973", "code": "BH" },
  { "name": "Oman", "dial_code": "+968", "code": "OM" },
  { "name": "Jordan", "dial_code": "+962", "code": "JO" },
  { "name": "Lebanon", "dial_code": "+961", "code": "LB" },
  { "name": "Iraq", "dial_code": "+964", "code": "IQ" },

  // Africa.
  { "name": "Egypt", "dial_code": "+20", "code": "EG" },
  { "name": "Morocco", "dial_code": "+212", "code": "MA" },
  { "name": "Algeria", "dial_code": "+213", "code": "DZ" },
  { "name": "Tunisia", "dial_code": "+216", "code": "TN" },
  { "name": "Kenya", "dial_code": "+254", "code": "KE" },
  { "name": "Ghana", "dial_code": "+233", "code": "GH" },
  { "name": "Ethiopia", "dial_code": "+251", "code": "ET" },
  { "name": "Tanzania", "dial_code": "+255", "code": "TZ" },
  { "name": "Uganda", "dial_code": "+256", "code": "UG" },
  { "name": "Senegal", "dial_code": "+221", "code": "SN" },
  { "name": "Ivory Coast", "dial_code": "+225", "code": "CI" },
  { "name": "Cameroon", "dial_code": "+237", "code": "CM" },
  { "name": "Zimbabwe", "dial_code": "+263", "code": "ZW" },
  { "name": "Zambia", "dial_code": "+260", "code": "ZM" },
  { "name": "Angola", "dial_code": "+244", "code": "AO" },
  { "name": "Mozambique", "dial_code": "+258", "code": "MZ" }
];

export default countryCodes;