"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMinutes = exports.hashCode = exports.generateNumericCode = void 0;
const crypto_1 = __importDefault(require("crypto"));
const generateNumericCode = (length = 6) => {
    let code = '';
    for (let i = 0; i < length; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
};
exports.generateNumericCode = generateNumericCode;
const hashCode = (code) => {
    return crypto_1.default.createHash('sha256').update(code).digest('hex');
};
exports.hashCode = hashCode;
const addMinutes = (date, minutes) => {
    return new Date(date.getTime() + minutes * 60000);
};
exports.addMinutes = addMinutes;
