// Utils
const assertValidObjectId = require('../utils/assertValidObjectId');
const throwError = require('./throwError');
const capitalize = require('./capitalize');

/*

    name: string
    type: string
    required: bool
    source: string
    minLength/maxLength: number
    min/max: number
    exclusiveMin/exclusiveMax: bool
    options: array

    {
        name: 'id',
        type: 'objectId',
        required: true,
        source: 'params'
    },
    {
        name: 'title',
        type: 'string',
        minLength: 0,
        maxLength: 100,
        required: true,
        source: 'body'
    },
    {
        name: 'price',
        type: 'number',
        min: 0,
        max: 100,
        required: false,
        source: 'body',
    },
    {
        name: 'picture',
        type: 'files',
        required: false,
        source: 'files',
    },
    {
        name: 'sort',
        type: 'string',
        required: false,
        source: 'query',
        options: ['price-asc', 'price-desc'],
    },

*/

function assertCorrectData(data, fields = [], schema = '') {
    fields.forEach((f) => {
        // Select the corresponding data object depending on the field name
        const sourceMap = {
            body: data.body,
            files: data.files,
            user: data.user,
            query: data, // TODO: modifier en data.query dans le controller
            params: data, // TODO: modifier en data.params dans le controller
        };
        const dataObj = sourceMap[f.source || 'body'];

        // Verify if field is required but absent
        if (
            (f.required || f.required === undefined) &&
            (!dataObj ||
                !dataObj[f.name] ||
                String(dataObj[f.name]).trim() === '')
        ) {
            throwError(`${capitalize(f.name)} is mandatory`, 400);
        }

        // Verify options if field is required or not required but present
        if (f.required || dataObj[f.name] !== undefined) {
            if (f.type === 'objectId') {
                assertValidObjectId(dataObj[f.name], schema);
            } else if (f.type === 'string') {
                if (
                    f.minLength !== undefined &&
                    dataObj[f.name].length < f.minLength
                ) {
                    throwError(
                        `${capitalize(f.name)} must be at least ${f.minLength} characters`,
                        400
                    );
                }

                if (
                    f.maxLength !== undefined &&
                    dataObj[f.name].length > f.maxLength
                ) {
                    throwError(
                        `${capitalize(f.name)}'s length cannot be greater than ${f.maxLength} characters`,
                        400
                    );
                }

                if (f.options !== undefined) {
                    const matchesOption = f.options.includes(dataObj[f.name]);

                    if (!matchesOption) {
                        throwError(
                            `${capitalize(f.name)} filter is invalid`,
                            400
                        );
                    }
                }
            } else if (f.type === 'number') {
                if (
                    String(dataObj[f.name]).trim() === '' ||
                    !Number.isFinite(Number(dataObj[f.name]))
                ) {
                    throwError(`${capitalize(f.name)} must be a number`, 400);
                }

                if (f.min !== undefined) {
                    const isExclusive = f.exclusiveMin === true;
                    const isInvalid = isExclusive
                        ? dataObj[f.name] <= f.min
                        : dataObj[f.name] < f.min;

                    if (isInvalid) {
                        throwError(
                            `${capitalize(f.name)} must be greater than${isExclusive ? '' : ' or equal to'} ${f.min}`,
                            400
                        );
                    }
                }

                if (f.max !== undefined && dataObj[f.name] > f.max) {
                    throwError(
                        `${capitalize(f.name)} must be lower than or equal to ${f.max}`,
                        400
                    );
                }
            }
        }
    });
}

module.exports = assertCorrectData;
