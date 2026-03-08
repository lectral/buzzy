(function (global, factory) {
    const exports = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exports;
    }

    global.BuzzyUtils = exports;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function formatTimeDifference(milliseconds) {
        if (milliseconds < 1000) {
            return `+${milliseconds}ms`;
        } else if (milliseconds < 60000) {
            return `+${(milliseconds / 1000).toFixed(2)}s`;
        } else {
            const mins = Math.floor(milliseconds / 60000);
            const secs = ((milliseconds % 60000) / 1000).toFixed(2);
            return `+${mins}m ${secs}s`;
        }
    }

    function hexToRgb(hex) {
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        const normalizedHex = hex.replace(shorthandRegex, (match, red, green, blue) => (
            red + red + green + green + blue + blue
        ));
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalizedHex);

        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    return {
        formatTimeDifference,
        hexToRgb
    };
});
