const gulp = require('gulp');
const path = require('path');
const del = require('del');
const ts = require('gulp-typescript');
const mocha = require('gulp-spawn-mocha');
const tslint = require('gulp-tslint');
const plumber = require('gulp-plumber');
const sourcemaps = require('gulp-sourcemaps');
const runSequence = require('run-sequence');
const remapIstanbul = require('remap-istanbul/lib/gulpRemapIstanbul');
const merge = require('merge2');
const Builder = require('systemjs-builder')
const liveServer = require('gulp-live-server');
const argv = require('yargs').argv;

gulp.task('clean', function () {
	return del([
		'dist/*',
	]);
});

const project = ts.createProject('tsconfig.json');
const scripts = ['src/**/*.ts'];
const buildTask = argv.coverage ? 'build-demo-coverage-remap' : (argv.tests ? 'build-demo-tests' : 'build-demo');

gulp.task('build', function () {
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
});

gulp.task('demo', function () {
	const builder = new Builder('', 'src/demo/config.js');
	return builder.buildStatic('dist/demo/demoClient.js', 'dist/demo/demo.js');
});

gulp.task('tests', function () {
	return gulp.src('dist/test/**/*.js', { read: false })
		.pipe(mocha({
			reporter: 'dot',
		}));
});

gulp.task('coverage', function () {
	return gulp.src('dist/test/**/*.js', { read: false })
		.pipe(mocha({
			reporter: 'dot',
			istanbul: {
				print: 'none',
			},
		}));
});

gulp.task('server', function () {
	const server = liveServer(['dist/demo/demoServer.js'], {});
	server.start();

	gulp.watch(['src/demo/**/*.html'], server.notify.bind(server));
	gulp.watch(['dist/**/*.js'], function () {
		server.start();
	});
});

gulp.task('watch', function () {
	gulp.watch(scripts, [buildTask]);
});

gulp.task('lint', function () {
	return gulp.src(scripts)
		.pipe(plumber())
		.pipe(tslint({
			report: 'verbose',
			configuration: require('./tslint.json')
		}))
		.pipe(tslint.report());
});

gulp.task('build-demo', function (done) {
	runSequence('build', 'demo', done);
});

gulp.task('build-demo-tests', function (done) {
	runSequence('build', 'demo', 'tests', done);
});

gulp.task('build-demo-coverage-remap', function (done) {
	runSequence('build', 'demo', 'coverage', 'remap', done);
});

gulp.task('dev', function (done) {
	runSequence('clean', buildTask, 'server', 'watch', done);
});

gulp.task('cov', function (done) {
	runSequence('build', 'coverage', 'remap', done);
});

gulp.task('test', function (done) {
	runSequence('build', 'tests', done);
});

gulp.task('remap', function () {
	return gulp.src('coverage/coverage.json')
		.pipe(remapIstanbul({
			reports: {
				html: 'coverage-remapped'
			}
		}));
});
