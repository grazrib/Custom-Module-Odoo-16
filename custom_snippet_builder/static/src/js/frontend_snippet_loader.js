odoo.define('custom_snippet_builder.frontend_snippet_loader', function (require) {
    'use strict';

    const publicWidget = require('web.public.widget');

    publicWidget.registry.CustomSnippet = publicWidget.Widget.extend({
        selector: 'body',
        start: function () {
            return this._super.apply(this, arguments).then(() => {
                this._loadCustomJS();
            });
        },
        _loadCustomJS: function () {
            const snippets = document.querySelectorAll('[data-snippet-js]');
            snippets.forEach(snippet => {
                try {
                    const script = snippet.getAttribute('data-snippet-js');
                    if (script) {
                        new Function(script)();
                    }
                } catch (e) {
                    console.error("Custom Snippet JS error:", e);
                }
            });
        }
    });
});