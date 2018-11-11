const gulp = require('gulp');
const path = require('path');
const del = require('del');
const ts = require('gulp-typescript');
const mocha = require('gulp-spawn-mocha');
const sourcemaps = require('gulp-sourcemaps');
const remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');
const merge = require('merge2');
const Builder = require('systemjs-builder')
const liveServer = require('gulp-live-server');
const argv = require('yargs').argv;

function swallowError(e) {
	console.log(e.message);
	this.emit('end');
}

const clean = () => del([
	'dist/*',
]);

const project = ts.createProject('tsconfig.json');
const scripts = ['src/**/*.ts'];

const build = () => {
	const result = gulp.src(scripts)
		.pipe(sourcemaps.init())
		.pipe(project(ts.reporter.defaultReporter()));

	return merge([
		result.dts
			.pipe(gulp.dest('dist')),
		result.js
			.pipe(sourcemaps.write({ sourceRoot: path.resolve('src') }))
			.pipe(gulp.dest('dist')),
	]);
};

const demo = () => {
	const builder = new Builder('', 'src/demo/config.js');
	return builder.buildStatic('dist/demo/demoClient.js', 'dist/demo/demo.js');
};

const tests = () => gulp.src('dist/test/**/*.js', { read: false })
	.pipe(mocha({
		reporter: 'dot',
		exit: true,
		timeout: 2000,
	}))
	.on('error', swallowError);

const coverage = () => gulp.src('dist/test/**/*.js', { read: false })
	.pipe(mocha({
		reporter: 'dot',
		exit: true,
		istanbul: { print: 'none' },
	}));

const remap = () => gulp.src('coverage/coverage.json')
	.pipe(remapIstanbul({ reports: { html: 'coverage-remapped' } }));

const server = () => {
	const server = liveServer(['dist/demo/demoServer.js'], {});
	server.start();

	const restart = cb => {
		server.start();
		cb();
	};

	gulp.watch(['src/demo/**/*.html']).on('change', path => server.notify({ path }));
	gulp.watch(['dist/**/*.js'], { delay: 1000 }, restart);
};

const empty = cb => cb();

const buildTasks = [
	build,
	argv.demo ? demo : undefined,
	argv.coverage ? coverage : tests,
	argv.coverage ? remap : undefined,
].filter(x => x);

const buildTask = gulp.series(...buildTasks);

const watch = cb => {
	gulp.watch(scripts, buildTask);
	cb();
};

const dev = gulp.series(clean, ...buildTasks, argv.demo ? server : empty, watch);
const cov = gulp.series(build, coverage, remap);
const test = gulp.series(build, tests);

module.exports = {
	build,
	dev,
	cov,
	test,
	default: dev,
};
