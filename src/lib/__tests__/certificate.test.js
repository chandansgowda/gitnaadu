import {
    encodeCertificate,
    decodeCertificate,
    verifyUrl,
    toDateKey,
    parseDateKey,
    formatDateKey,
    certificateData,
    SITE_URL,
    shareLinks,
    sharePost,
    linkedInAddUrl,
} from "../certificateLink";
import { cleanDetails, validateDetails } from "../certificateForm";

describe("certificate link", () => {
    test("a name and date survive the round trip", () => {
        const code = encodeCertificate("Ananya Rao", "20261118");
        expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(decodeCertificate(code)).toEqual({ name: "Ananya Rao", dateKey: "20261118" });
    });

    test("Kannada names and names containing | work", () => {
        for (const name of ["ಅನನ್ಯ ರಾವ್", "A | B", "José O'Neil-Smith"]) {
            expect(decodeCertificate(encodeCertificate(name, "20260101"))).toEqual({ name, dateKey: "20260101" });
        }
    });

    test("the code is plain base64 of the name and date", () => {
        const text = Buffer.from(encodeCertificate("Ananya Rao", "20261118"), "base64url").toString("utf8");
        expect(text.startsWith("Ananya Rao|20261118|")).toBe(true);
    });

    test("an edited link is rejected", () => {
        const code = encodeCertificate("Ananya Rao", "20261118");
        const text = Buffer.from(code, "base64url").toString("utf8");
        const forge = (t) => Buffer.from(t, "utf8").toString("base64url");
        expect(decodeCertificate(forge(text.replace("Ananya", "Someone")))).toBeNull();
        expect(decodeCertificate(forge(text.replace("20261118", "20251118")))).toBeNull();
    });

    test("garbage is rejected", () => {
        for (const bad of [null, "", "abc", "!!!!", "a".repeat(700), Buffer.from("x|20261340|y").toString("base64url")])
            expect(decodeCertificate(bad)).toBeNull();
    });

    test("verifyUrl points at the site root with a cert parameter", () => {
        const url = new URL(verifyUrl("Ananya Rao", "20261118"));
        expect(url.origin).toBe(SITE_URL);
        expect(url.pathname).toBe("/");
        expect(decodeCertificate(url.searchParams.get("cert"))).toEqual({ name: "Ananya Rao", dateKey: "20261118" });
    });

    test("date keys", () => {
        expect(toDateKey(new Date(2026, 10, 5, 13).toISOString())).toBe("20261105");
        expect(toDateKey("not a date")).toMatch(/^\d{8}$/);
        expect(parseDateKey("20260230")).toBeNull();
        expect(parseDateKey("2026-02-03")).toBeNull();
        expect(formatDateKey("20261118")).toMatch(/18 November 2026/);
        expect(certificateData("A B", "20261118")).toMatchObject({ name: "A B", dateText: formatDateKey("20261118") });
    });
});

describe("certificate details form", () => {
    const good = {
        name: "  Ananya   Rao ",
        email: " Ananya@Example.com ",
        phone: "+91 98765-43210",
        orgType: "college",
        orgName: "Example College",
    };

    test("details are cleaned", () => {
        expect(cleanDetails(good)).toEqual({
            name: "Ananya Rao",
            email: "ananya@example.com",
            phone: "+919876543210",
            orgType: "college",
            orgName: "Example College",
        });
    });

    test("valid details pass", () => {
        expect(validateDetails(cleanDetails(good))).toEqual({});
    });

    test("each bad field is reported", () => {
        const errors = validateDetails(cleanDetails({ name: "1", email: "nope", phone: "123", orgType: "x", orgName: "" }));
        expect(Object.keys(errors).sort()).toEqual(["email", "name", "orgName", "orgType", "phone"]);
    });
});

describe("certificate sharing", () => {
    const url = "https://gitnaadu.engineeringinkannada.in/?cert=abc";

    test("the post names the certificate link, the site and the course", () => {
        const post = sharePost({ url, course: "Git & GitHub", organization: "Engineering in Kannada", courseUrl: "https://example.com/course" });
        for (const part of [url, SITE_URL, "https://example.com/course", "Git & GitHub", "#GitNaadu"]) expect(post.long).toContain(part);
        expect(post.short).toContain(url);
        // X counts any link as 23 characters.
        expect(post.short.replace(url, "x".repeat(23)).length).toBeLessThanOrEqual(280);
        expect(sharePost({ url, course: "Git", organization: "EiK" }).long).not.toContain("Watch the full course");
    });

    test("every share link opens with the post text filled in", () => {
        const post = { long: "Line one & more\nLine two " + url, short: "Short " + url };
        const links = shareLinks(post);
        expect(Object.keys(links)).toEqual(["linkedin", "x", "whatsapp"]);
        expect(new URL(links.linkedin).searchParams.get("text")).toBe(post.long);
        expect(new URL(links.linkedin).searchParams.get("shareActive")).toBe("true");
        expect(new URL(links.x).searchParams.get("text")).toBe(post.short);
        expect(new URL(links.whatsapp).searchParams.get("text")).toBe(post.long);
    });

    test("LinkedIn add-to-profile link is pre-filled", () => {
        const p = new URL(
            linkedInAddUrl({ url, dateKey: "20261118", course: "Git & GitHub", organization: "Engineering in Kannada" }),
        ).searchParams;
        expect(Object.fromEntries(p)).toEqual({
            startTask: "CERTIFICATION_NAME",
            name: "Git & GitHub",
            organizationName: "Engineering in Kannada",
            issueYear: "2026",
            issueMonth: "11",
            certUrl: url,
        });
    });
});
