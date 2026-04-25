import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));

const width = parseNumber(args.width, 1440);
const height = parseNumber(args.height, 1024);
const pagePath = normalizePagePath(args.page ?? "index.html");
const screenshotPath = path.resolve(projectRoot, args.out ?? "screenshots/latest.png");
const selector = args.selector ?? null;
const fullPage = args["full-page"] !== undefined;

const server = http.createServer((request, response) => {
    serveRequest(request, response).catch((error) => {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(`Server error: ${error.message}`);
    });
});

server.listen(0, "127.0.0.1", async () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 4173;
    const url = `http://127.0.0.1:${port}/${pagePath}`;
    let browser;

    try {
        await mkdir(path.dirname(screenshotPath), { recursive: true });
        browser = await launchBrowser();

        const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: 1
        });
        const page = await context.newPage();

        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(url, { waitUntil: "networkidle" });
        await page.evaluate(async () => {
            if (document.fonts?.ready) {
                await document.fonts.ready;
            }
        });
        await page.addStyleTag({
            content: `
                *, *::before, *::after {
                    animation-duration: 0s !important;
                    animation-delay: 0s !important;
                    transition-duration: 0s !important;
                    transition-delay: 0s !important;
                    scroll-behavior: auto !important;
                }
            `
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);

        if (selector) {
            const element = page.locator(selector);
            await element.waitFor({ state: "visible" });
            await element.screenshot({ path: screenshotPath });
        } else {
            await page.screenshot({
                path: screenshotPath,
                fullPage
            });
        }

        console.log(`Saved screenshot to ${screenshotPath}`);
        console.log(`Source URL: ${url}`);
        console.log(`Viewport: ${width}x${height}`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    } finally {
        if (browser) {
            await browser.close();
        }

        server.close();
    }
});

async function serveRequest(request, response) {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const normalizedPath = normalizePagePath(pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
    const filePath = path.resolve(projectRoot, normalizedPath);

    if (!filePath.startsWith(projectRoot)) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
    }

    let fileInfo;
    try {
        fileInfo = await stat(filePath);
    } catch {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
    }

    if (fileInfo.isDirectory()) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
    }

    response.writeHead(200, {
        "Content-Type": getContentType(filePath),
        "Cache-Control": "no-store"
    });

    createReadStream(filePath).pipe(response);
}

async function launchBrowser() {
    const candidates = [
        { label: "Microsoft Edge", options: { channel: "msedge", headless: true } },
        { label: "Google Chrome", options: { channel: "chrome", headless: true } },
        {
            label: "Edge executable",
            options: {
                executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
                headless: true
            }
        },
        {
            label: "Chrome executable",
            options: {
                executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                headless: true
            }
        }
    ];

    const errors = [];

    for (const candidate of candidates) {
        try {
            return await chromium.launch({
                ...candidate.options,
                args: ["--disable-dev-shm-usage"]
            });
        } catch (error) {
            errors.push(`${candidate.label}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    throw new Error(`Could not launch a browser.\n${errors.join("\n")}`);
}

function parseArgs(argv) {
    const parsed = {};

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (!token.startsWith("--")) {
            continue;
        }

        const key = token.slice(2);
        const nextToken = argv[index + 1];

        if (!nextToken || nextToken.startsWith("--")) {
            parsed[key] = true;
            continue;
        }

        parsed[key] = nextToken;
        index += 1;
    }

    return parsed;
}

function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePagePath(value) {
    return value.replace(/\\/g, "/").replace(/^\/+/, "") || "index.html";
}

function getContentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const types = {
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml; charset=utf-8",
        ".webp": "image/webp"
    };

    return types[extension] ?? "application/octet-stream";
}
