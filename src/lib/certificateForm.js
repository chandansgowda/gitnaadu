// Learner details collected before the certificate is issued. They are sent
// to a Google Form (so the responses land in its linked Google Sheet), but
// the form itself is never shown: we render our own fields and POST the
// answers to the form's `formResponse` endpoint.
//
// Setting it up:
//   1. Create a Google Form with these questions, in any order:
//        Full name              (Short answer)
//        Email                  (Short answer)
//        Phone number           (Short answer)
//        College or Company     (Multiple choice: "College", "Company")
//        College / Company name (Short answer)
//      Leave "Collect email addresses" and "Limit to 1 response" OFF, and
//      don't require sign-in, or anonymous submissions are rejected.
//   2. Form id: open the form's public link (Send > link). It looks like
//        https://docs.google.com/forms/d/e/<FORM_ID>/viewform
//   3. Field ids: in the form editor choose "Get pre-filled link", fill every
//      answer, and copy the link. It contains one `entry.<number>=` per
//      question; put each number below.
//   4. The multiple-choice option labels must match ORG_LABELS exactly.
export const CERT_FORM = {
    formId: "1FAIpQLSdCGTxqsC3K1n3qcXrpGGtP8vw2-lj-DLo5_vcQXNKXWkculA",
    fields: {
        name: "entry.530802594",
        email: "entry.1377917474",
        phone: "entry.1905967516",
        orgType: "entry.2064769823",
        orgName: "entry.1297935693",
    },
};

export const ORG_LABELS = { college: "College", company: "Company" };

export const isFormConfigured = () =>
    Boolean(CERT_FORM.formId) && Object.values(CERT_FORM.fields).every(Boolean);

const cleanText = (s, max) =>
    String(s || "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);

export const cleanDetails = (d) => ({
    name: cleanText(d.name, 48),
    email: cleanText(d.email, 120).toLowerCase(),
    phone: String(d.phone || "").replace(/[^\d+]/g, "").slice(0, 16),
    orgType: d.orgType === "company" ? "company" : d.orgType === "college" ? "college" : "",
    orgName: cleanText(d.orgName, 120),
});

// → { [field]: message } for every invalid field (expects cleaned details).
export const validateDetails = (d) => {
    const errors = {};
    if (d.name.length < 2 || !/\p{L}/u.test(d.name)) errors.name = "Please enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.email = "Please enter a valid email address.";
    const digits = d.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15 || !/^\+?\d+$/.test(d.phone))
        errors.phone = "Please enter a valid phone number.";
    if (!d.orgType) errors.orgType = "Please choose one.";
    if (d.orgName.length < 2)
        errors.orgName = `Please enter your ${d.orgType === "company" ? "company" : "college"} name.`;
    return errors;
};

// Send the details to the Google Form. Google doesn't allow cross-origin
// reads of the response, so the request is "no-cors": it resolves once the
// request was sent and rejects only when the network is unreachable.
// Resolves to false (nothing sent) when the form isn't configured yet.
export const submitDetails = async (details) => {
    if (!isFormConfigured()) {
        console.warn("[GitNaadu] Certificate form is not configured (see src/lib/certificateForm.js); details were not sent.");
        return false;
    }
    const f = CERT_FORM.fields;
    const body = new URLSearchParams();
    body.set(f.name, details.name);
    body.set(f.email, details.email);
    body.set(f.phone, details.phone);
    body.set(f.orgType, ORG_LABELS[details.orgType]);
    body.set(f.orgName, details.orgName);
    await fetch(`https://docs.google.com/forms/d/e/${CERT_FORM.formId}/formResponse`, {
        method: "POST",
        mode: "no-cors",
        body,
    });
    return true;
};
