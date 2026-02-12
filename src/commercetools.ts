import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const {
    CT_PROJECT_KEY,
    CT_CLIENT_ID,
    CT_CLIENT_SECRET,
    CT_AUTH_URL,
    CT_API_URL,
} = process.env;

if (
    !CT_PROJECT_KEY ||
    !CT_CLIENT_ID ||
    !CT_CLIENT_SECRET ||
    !CT_AUTH_URL ||
    !CT_API_URL
) {
    throw new Error("Missing required commercetools environment variables");
}

let accessToken = "";

export async function getAccessToken() {
    if (accessToken) return accessToken;

    const res = await fetch(`${CT_AUTH_URL}/oauth/token`, {
        method: "POST",
        headers: {
            Authorization:
                "Basic " +
                Buffer.from(`${CT_CLIENT_ID}:${CT_CLIENT_SECRET}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlenc-----------------oded",
        },
        body: "grant_type=client_credentials",
    });

    const data = await res.json();
    accessToken = data.access_token;
    return accessToken;
}

export async function executeGraphQL(query: string) {
    const token = await getAccessToken();

    const res = await fetch(
        `${CT_API_URL}/${CT_PROJECT_KEY}/graphql`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
        }
    );
    return res.json();
}
