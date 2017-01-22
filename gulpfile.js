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

const seq = (...tasks) => done => runSequence(...tasks, done);

gulp.task('clean', () => {
	return del([
		'dist/*',
	]);
});

const project = ts.createProject('tsconfig.json');
const scripts = ['src/**/*.ts'];

gulp.task('build', () => {
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

gulp.task('demo', () => {
	const builder = new Builder('', 'src/demo/config.js');
	return builder.buildStatic('dist/demo/demoClient.js', 'dist/demo/demo.js');
});

gulp.task('tests', () => {
	return gulp.src('dist/test/**/*.js', { read: false })
		.pipe(mocha({
			reporter: 'dot',
		}));
});

gulp.task('coverage', () => {
	return gulp.src('dist/test/**/*.js', { read: false })
		.pipe(mocha({
			reporter: 'dot',
			istanbul: {
				print: 'none',
			},
		}));
});

gulp.task('server', () => {
	const server = liveServer(['dist/demo/demoServer.js'], {});
	server.start();

	gulp.watch(['src/demo/**/*.html'], server.notify.bind(server));
	gulp.watch(['dist/**/*.js'], () => {
		server.start();
	});
});

gulp.task('watch', () => {
	gulp.watch(scripts, ['build-task']);
});

gulp.task('lint', () => {
	return gulp.src(scripts)
		.pipe(plumber())
		.pipe(tslint({
			report: 'verbose',
			configuration: require('./tslint.json')
		}))
		.pipe(tslint.report());
});

gulp.task('remap', () => {
	return gulp.src('coverage/coverage.json')
		.pipe(remapIstanbul({
			reports: {
				html: 'coverage-remapped'
			}
		}));
});

const buildTasks = [
	'build',
	argv.demo ? 'demo' : '',
	argv.tests && !argv.coverage ? 'tests' : '',
	argv.coverage ? 'coverage' : '',
	argv.coverage ? 'remap' : ''
].filter(x => !!x);

gulp.task('empty', () => { });
gulp.task('build-task', seq(...buildTasks));
gulp.task('dev', seq('clean', ...buildTasks, argv.demo ? 'server' : 'empty', 'watch'));
gulp.task('cov', seq('build', 'coverage', 'remap'));
gulp.task('test', seq('build', 'tests'));
