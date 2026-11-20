// One-time nudges about the certificate, remembered per browser:
//   "announced": the "complete the challenges and get certified" pop-up was shown
//   "offered":   the certificate dialog was opened automatically once
// (After that the certificate stays one tap away in the Challenges panel.)

const CLAIM_KEY = "gitnaadu:certificate"; // written by CertificateDialog
const flagKey = (name) => `gitnaadu:certificate-${name}`;

export const hasClaimedCertificate = () => {
    try {
        return Boolean(window.localStorage.getItem(CLAIM_KEY));
    } catch {
        return false;
    }
};

export const certificateFlag = (name) => {
    try {
        return window.localStorage.getItem(flagKey(name)) === "1";
    } catch {
        return true; // storage unavailable: never nag
    }
};

export const setCertificateFlag = (name) => {
    try {
        window.localStorage.setItem(flagKey(name), "1");
    } catch {
        // ignore
    }
};

// "3 more challenges to go for your certificate." (empty when none are left)
export const remainingForCertificate = (left) =>
    left > 0 ? `${left} more challenge${left === 1 ? "" : "s"} to go for your certificate.` : "";
