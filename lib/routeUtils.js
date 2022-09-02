// Utilities for managing route specs to return in routes

// Select which option to use
function pickOption(options) {
    const result = options.find(option => {
        return option !== undefined && option !== null;
    });

    if (result) {
        return result;
    } else  {
        return '';
    }
}

function normalizeSegment(segment) {
    if (segment.length > 0) {
        segment = segment.replace(/^\/*/, '/');
        
        if (segment.length > 1) {
            segment = segment.replace(/\/+$/, '');
        }
    }

    return segment;
}

exports.getBaseRef = function(req, options = {}) {
    const baseReference = req.app.get('baseReference').replace(/\/+$/, '');
    const baseUrl = normalizeSegment(pickOption([options.baseUrl, req.baseUrl]));
    const path = normalizeSegment(pickOption([options.path, req.path]));
    const result = baseReference + baseUrl + path;
    return result.replace(/\/+$/, '');
}

exports.getModelUrl = function (req, model, options = {}) {
    options = {
        path: '',
        ...options,
    };
    return `${exports.getBaseRef(req, options)}/${model.id}`;
}

exports.getPageUrls = function (req, data, options = {}) {
    const baseRef = exports.getBaseRef(req, options);
    const offset = req.query.offset || 0;
    const limit = req.query.limit || 10;
    const result = {};

    if (data.length >= Number(limit)) {
        const newOffset = Number(offset) + Number(limit);
        result.nextPage = `${baseRef}/?offset=${newOffset}&limit=${limit}`;
    }

    if (offset > 0) {
        const newOffset = Math.max(Number(offset) - Number(limit), 0);
        result.prevPage = `${baseRef}/?offset=${newOffset}&limit=${limit}`;
    }

    return result;
}