var TypedocPlugin = require('typedoc-webpack-plugin');
var webpack = require('webpack');

module.exports = {
    context: __dirname, // Paths are relative to nengo_gui
    // Putting the entry point in a list is a workaround for this error:
    // Error: a dependency to an entry point is not allowed
    entry: ['./nengo_gui/static/nengo.ts'],
    output: {
        path: './nengo_gui/static/dist',
        filename: 'nengo.js',
        library: 'Nengo',
        publicPath: '/static/dist/' // Fixes issue finding emitted files
    },
    resolve: {
        extensions: ['', '.js', '.ts']
    },
    module: {
        loaders: [
            { test: /\.css$/, loader: 'style-loader!css-loader!postcss-loader' },
            { test: /\.ico$/, loader: 'file-loader?name=[name].[ext]' },
            { test: /\.(png|jpg|gif)$/, loader: 'url-loader?limit=8192' },
            {
                test: /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: 'url-loader?limit=8192&mimetype=application/font-woff&name=./[hash].[ext]'
            },
            {
                test: /\.(ttf|eot|svg)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: 'file-loader?name=./[hash].[ext]'
            },
            { test: /\.json$/, loader: 'json-loader' },
            { test: /\.tsx?$/, loader: 'ts-loader' },
        ],
    },
    plugins: [
        require('webpack-fail-plugin'),
        new webpack.ProvidePlugin({
            $: 'jquery',
            jQuery: 'jquery',
            "window.jQuery": 'jquery',
        }),
    ],
    postcss: function() {
        return [
            require('postcss-import')({ // Must be first
                path: ['./nengo_gui/static'],
            }),
            require('postcss-nested-props'), // Must be before postcss-nested
            require('postcss-nested'),
            require('postcss-color-function'),
            require('postcss-color-gray'),
            require('postcss-atroot'),
            require('postcss-custom-properties'),
            require('autoprefixer'),
        ];
    }
}

// Pass in --no-docs to skip building documentation
if (process.argv.indexOf('--no-docs') === -1) {
    module.exports.plugins.push(new TypedocPlugin({}));
}
