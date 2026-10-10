export type CompanySlipProfile = {
  name: string;
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
  name: "Starline Property",
  logo: "",
  stamp: "",
  signature: "",
  signatory: "",
  signatoryTitle: "Authorised signatory",
  showBarcode: true,
  showQr: true,
  showSignature: true,
  showStamp: true,
};

export function loadCompanySlip(): CompanySlipProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCompanySlip;
    const parsed = JSON.parse(raw) as Partial<CompanySlipProfile>;
    return {
      ...defaultCompanySlip,
      ...parsed,
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : defaultCompanySlip.name,
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

function imageOrEmpty(value: unknown) {
  return typeof value === "string" && value.startsWith("data:image/") ? value : "";
}
