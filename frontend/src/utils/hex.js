/**
 * This file is part of NetraX.
 * Repository: https://github.com/jigarvarma2k20/NetraX
 *
 * Copyright (c) 2026 NetraX Contributors
 *
 * SPDX-License-Identifier: GPL-3.0
 */

export function hexDump(str) {
    const lines = [];
    const buffer = new TextEncoder().encode(str);

    for (let i = 0; i < buffer.length; i += 16) {
        const chunk = buffer.slice(i, i + 16);
        const hex = Array.from(chunk)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');

        // Pad hex if chunk is less than 16 bytes
        const paddedHex = hex.padEnd(47, ' ');

        const ascii = Array.from(chunk)
            .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
            .join('');

        lines.push(`${i.toString(16).padStart(8, '0')}  ${paddedHex}  |${ascii}|`);
    }

    return lines.join('\n');
}
