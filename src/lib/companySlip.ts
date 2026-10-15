export type SlipPaper = "a4" | "letter";
export type SlipTemplate = "classic" | "clean" | "compact";

export type CompanySlipProfile = {
  name: string;
  location: string;
  phone: string;
  email: string;
  registrationNumber: string;
  paper: SlipPaper;
  slipTemplate: SlipTemplate;
  slipTitle: string;
  slipFooter: string;
  signLabel: string;
  stampLabel: string;
  logo: string;
  stamp: string;
  signature: string;
  signatory: string;
  signatoryTitle: string;
  showBarcode: boolean;
  showQr: boolean;
  showSignature: boolean;
  showStamp: boolean;
};

const STORAGE_KEY = "starline.company.slip.v1";

export const defaultCompanySlip: CompanySlipProfile = {
  name: "Starline Builder's Limited",
  location: "",
  phone: "",
  email: "",
  registrationNumber: "",
  paper: "a4",
  slipTemplate: "classic",
  slipTitle: "Payment slip",
  slipFooter: "",
  signLabel: "Sign",
  stampLabel: "Company stamp",
  logo: "",
  stamp: "",
  signature: "",
  signatory: "",
  signatoryTitle: "Authorised signatory",
  showBarcode: true,
  showQr: true,
  showSignature: false,
  showStamp: false,
};

export const companyLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="48" height="48" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0f766e"/><path d="M8 22V14l8-6 8 6v8" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;

export function loadCompanySlip(): CompanySlipProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCompanySlip;
    const parsed = JSON.parse(raw) as Partial<CompanySlipProfile>;
    return {
      ...defaultCompanySlip,
      ...parsed,
      name: companyName(parsed.name),
      location: text(parsed.location),
      phone: text(parsed.phone),
      email: text(parsed.email),
      registrationNumber: text(parsed.registrationNumber),
      paper: parsed.paper === "letter" ? "letter" : "a4",
      slipTemplate: parsed.slipTemplate === "clean" || parsed.slipTemplate === "compact" ? parsed.slipTemplate : "classic",
      slipTitle: text(parsed.slipTitle) || "Payment slip",
      slipFooter: text(parsed.slipFooter),
      signLabel: text(parsed.signLabel) || "Sign",
      stampLabel: text(parsed.stampLabel) || "Company stamp",
      logo: imageOrEmpty(parsed.logo),
      stamp: imageOrEmpty(parsed.stamp),
      signature: imageOrEmpty(parsed.signature),
      signatory: typeof parsed.signatory === "string" ? parsed.signatory : "",
      signatoryTitle: typeof parsed.signatoryTitle === "string" ? parsed.signatoryTitle : defaultCompanySlip.signatoryTitle,
      showBarcode: parsed.showBarcode !== false,
      showQr: parsed.showQr !== false,
      showSignature: parsed.showSignature !== false,
      showStamp: parsed.showStamp !== false,
    };
  } catch {
    return defaultCompanySlip;
  }
}

export function saveCompanySlip(profile: CompanySlipProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function readSlipImage(file: File, maxEdge: number) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose a PNG, JPG, or WebP image."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not read the image."));
      image.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not read the image."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function companyName(value: unknown) {
  if (typeof value !== "string") return defaultCompanySlip.name;
  const name = value.trim();
  if (!name || name === "Starline Property") return defaultCompanySlip.name;
  return name;
}

function imageOrEmpty(value: unknown) {
  return typeof value === "string" && value.startsWith("data:image/") ? value : "";
}
