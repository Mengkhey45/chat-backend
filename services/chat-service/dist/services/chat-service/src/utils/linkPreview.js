"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLinkPreview = fetchLinkPreview;
const node_fetch_1 = __importDefault(require("node-fetch"));
async function fetchLinkPreview(url) {
    try {
        const res = await (0, node_fetch_1.default)(url); // Removed invalid 'timeout' property
        const html = await res.text();
        const title = html.match(/<title>(.*?)<\/title>/i)?.[1];
        const desc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]
            || html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i)?.[1];
        const image = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i)?.[1];
        return {
            url,
            ...(title !== undefined ? { title } : {}),
            ...(desc !== undefined ? { description: desc } : {}),
            ...(image !== undefined ? { image } : {})
        }; // All properties are optional in LinkPreview
    }
    catch (err) {
        return null;
    }
}
