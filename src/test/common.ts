/// <reference types="mocha" />
/// <reference path="../../typings/chai.d.ts" />
/// <reference path="../../typings/chai-as-promised.d.ts" />

require('source-map-support').install();

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);
