import crypto from 'crypto';
export const generateNumericCode = (length = 6) => {
    let code = '';
    for (let i = 0; i < length; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
};
export const hashCode = (code) => {
    return crypto.createHash('sha256').update(code).digest('hex');
};
export const addMinutes = (date, minutes) => {
    return new Date(date.getTime() + minutes * 60000);
};
