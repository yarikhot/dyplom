"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const editor_1 = require("./editor");
exports.shouldBeConsideredJsFiles = (...files) => {
    const extentionsToBeConsideredJS = editor_1.config().jsFilesExtensions;
    return files.every(file => extentionsToBeConsideredJS.includes(path.extname(file).replace('.', '')));
};
exports.commonJSModuleSystemUsed = () => editor_1.config().jsModuleSystem === 'commonjs';
const isExperimentOn = (experiment) => (editor_1.config().experiments || []).includes(experiment);
exports.isHooksForFunctionalComponentsExperimentOn = () => isExperimentOn('hooksForFunctionalComponents');
exports.esmModuleSystemUsed = () => editor_1.config().jsModuleSystem === 'esm';
exports.shouldSwitchToTarget = () => editor_1.config().switchToTarget;
//# sourceMappingURL=settings.js.map