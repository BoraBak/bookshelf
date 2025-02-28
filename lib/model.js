'use strict';

const _ = require('lodash');
const createError = require('create-error');

const Sync = require('./sync');
const Helpers = require('./helpers');
const EagerRelation = require('./eager');
const Errors = require('./errors');

const ModelBase = require('./base/model');
const Promise = require('bluebird');

/**
 * @class Model
 * @extends ModelBase
 * @inheritdoc
 * @classdesc
 * Models are simple objects representing individual database rows, specifying
 * the tableName and any relations to other models. They can be extended with
 * any domain-specific methods, which can handle components such as validations,
 * computed properties, and access control.
 *
 * @constructor
 * @description
 * When defining a model you should use the {@link Bookshelf#model bookshelf.model} method, since it will allow you to
 * avoid circular dependency problems. However, it's still possible to create models using the regular constructor.
 *
 * When creating an instance of a model, you can pass in the initial values of
 * the attributes, which will be {@link Model#set set} on the
 * model. If you define an {@link initialize} function, it will be invoked
 * when the model is created.
 *
 *     new Book({
 *       title: "One Thousand and One Nights",
 *       author: "Scheherazade"
 *     });
 *
 * In rare cases, if you're looking to get fancy, you may want to override
 * {@link Model#constructor constructor}, which allows you to replace the
 * actual constructor function for your model.
 *
 *     let Book = bookshelf.model('Book', {
 *       tableName: 'documents',
 *       constructor: function() {
 *         bookshelf.Model.apply(this, arguments);
 *         this.on('saving', function(model, attrs, options) {
 *           options.query.where('type', '=', 'book');
 *         });
 *       }
 *     });
 *
 * @param {Object}   attributes            Initial values for this model's attributes.
 * @param {Object=}  options               Hash of options.
 * @param {string=}  options.tableName     Initial value for {@link Model#tableName tableName}.
 * @param {Boolean=} [options.hasTimestamps=false]
 *
 *   Initial value for {@link Model#hasTimestamps hasTimestamps}.
 *
 * @param {Boolean} [options.parse=false]
 *
 *   Convert attributes by {@link Model#parse parse} before being {@link
 *   Model#set set} on the model.
 *
 */
const BookshelfModel = ModelBase.extend(
  {
    /**
     * This relation specifies that this table has exactly one of another type of object, specified by a foreign key in
     * the other table.
     *
     * @example
     * const Record = bookshelf.model('Record', {
     *   tableName: 'health_records'
     * })
     *
     * const Patient = bookshelf.model('Patient', {
     *   tableName: 'patients',
     *   record() {
     *     return this.hasOne('Record')
     *   }
     * })
     *
     * // select * from `health_records` where `patient_id` = 1
     * new Patient({id: 1}).related('record').fetch().then(function(model) {
     *   // ...
     * })
     *
     * // Alternatively, if you don't need the relation loaded on the patient's relations hash:
     * new Patient({id: 1}).record().fetch().then(function(model) {
     *   // ...
     * })
     *
     * @method Model#hasOne
     * @param {Model|string} Target
     *   Constructor of {@link Model} targeted by join. Can be a string specifying a previously registered model with
     *   {@link Bookshelf#model}.
     * @param {string} [foreignKey]
     *   Foreign key in the `Target` model. By default the foreign key is assumed to be the singular form of this
     *   model's {@link Model#tableName tableName} followed by `_id` / `_{{{@link Model#idAttribute idAttribute}}}`.
     * @param {string} [foreignKeyTarget]
     *   Column in this model's table which `foreignKey` references, if other than this model's `id` /
     *   `{@link Model#idAttribute idAttribute}`.
     * @returns {Model}
     *   The return value will always be a model, even if the relation doesn't exist, but in that case the relation will
     *   be `null` when {@link Model#serialize serializing} the model.
     */
    hasOne(Target, foreignKey, foreignKeyTarget) {
      return this._relation('hasOne', Target, {
        foreignKey,
        foreignKeyTarget
      }).init(this);
    },

    /**
     * This relation specifies that this model has one or more rows in another table which match on this model's primary
     * key.
     *
     * @example
     * const Author = bookshelf.model('Author', {
     *   tableName: 'authors',
     *   books() {
     *     return this.hasMany('Book')
     *   }
     * })
     *
     * // select * from `authors` where id = 1
     * // select * from `books` where author_id = 1
     * Author.where({id: 1}).fetch({withRelated: ['books']}).then(function(author) {
     *   console.log(JSON.stringify(author.related('books')))
     * })
     *
     * @method Model#hasMany
     * @param {Model|string} Target
     *   Constructor of {@link Model} targeted by join. Can be a string specifying a previously registered model with
     *   {@link Bookshelf#model}.
     * @param {string} [foreignKey]
     *   ForeignKey in the `Target` model. By default, the foreign key is assumed to be the singular form of this
     *   model's tableName, followed by `_id` / `_{{{@link Model#idAttribute idAttribute}}}`.
     * @param {string} [foreignKeyTarget]
     *   Column in this model's table which `foreignKey` references, if other than this model's `id` /
     *   `{@link Model#idAttribute idAttribute}`.
     * @returns {Collection} A new empty Collection.
     */
    hasMany(Target, foreignKey, foreignKeyTarget) {
      return this._relation('hasMany', Target, {
        foreignKey,
        foreignKeyTarget
      }).init(this);
    },

    /**
     * This relationship is used when a model is a member of another `Target` model.
     *
     * It can be used in {@tutorial one-to-one} associations as the inverse of a
     * {@link Model#hasOne hasOne}. It can also used in {@tutorial one-to-many} associations as the
     * inverse of {@link Model#hasMany hasMany}, and is the "one" side of that association. In both
     * cases, the belongsTo relationship is used for a model that is a member of another Target
     * model, referenced by the `foreignKey` attribute in the current model.
     *
     * @example
     * const Book = bookshelf.model('Book', {
     *   tableName: 'books',
     *   author() {
     *     return this.belongsTo('Author')
     *   }
     * })
     *
     * // select * from `books` where id = 1
     * // select * from `authors` where id = book.author_id
     * Book.where({id: 1}).fetch({withRelated: ['author']}).then((book) => {
     *   console.log(JSON.stringify(book.related('author')))
     * })
     *
     * @method Model#belongsTo
     * @param {Model|string} Target
     *   Constructor of {@link Model} targeted by the join. Can be a string specifying a previously registered model
     *   with {@link Bookshelf#model}.
     * @param {string} [foreignKey]
     *   Foreign key in this model. By default, the `foreignKey` is assumed to be the singular form
     *   of the `Target` model's tableName, followed by `_id`, or
     *   `_{{{@link Model#idAttribute idAttribute}}}` if the `idAttribute` property is set.
     * @param {string} [foreignKeyTarget]
     *   Column in the `Target` model's table which `foreignKey` references. This is only needed in
     *   case it's other than `Target` model's `id` / `{@link Model#idAttribute idAttribute}`.
     * @returns {Model}
     *   The return value will always be a model, even if the relation doesn't exist, but in that
     *   case the relation will be `null` when {@link Model#serialize serializing} the model.
     */
    belongsTo(Target, foreignKey, foreignKeyTarget) {
      return this._relation('belongsTo', Target, {
        foreignKey,
        foreignKeyTarget
      }).init(this);
    },

    /**
     * Defines a many-to-many relation, where the current model is joined to one or more of a
     * `Target` model through another table. The default name for the joining table is the two
     * models' table names joined by an underscore, and ordered alphabetically. For example, a
     * `users` table and an `accounts` table would have a joining table named `accounts_users`.
     *
     * The default key names in the joining table are the singular versions of the model table
     * names, followed by `_id` / `_{{{@link Model#idAttribute idAttribute}}}`. So in the above
     * example the columns in the joining table would be `user_id`, `account_id`, and `access`,
     * which is used as an example of how dynamic relations can be formed using different contexts.
     *
     * To customize the keys or the {@link Model#tableName tableName} used for the join table, you
     * may specify them in the arguments to the function call:
     *
     *     this.belongsToMany(Account, 'users_accounts', 'userId', 'accountId')
     *
     * If you wish to create a belongsToMany association where the joining table has a primary key
     * and extra attributes in the model, you may create a `belongsToMany`
     * {@link Relation#through through} relation:
     *
     *     const Doctor = bookshelf.model('Doctor', {
     *       patients() {
     *         return this.belongsToMany('Patient').through('Appointment')
     *       }
     *     })
     *
     *     const Appointment = bookshelf.model('Appointment', {
     *       patient() {
     *         return this.belongsTo('Patient')
     *       },
     *       doctor() {
     *         return this.belongsTo('Doctor')
     *       }
     *     })
     *
     *     const Patient = bookshelf.model('Patient', {
     *       doctors() {
     *         return this.belongsToMany('Doctor').through('Appointment')
     *       }
     *     })
     *
     * Collections returned by a `belongsToMany` relation are decorated with several pivot helper
     * methods. If you need more information about these methods see
     * {@link Collection#attach attach}, {@link Collection#detach detach},
     * {@link Collection#updatePivot updatePivot} and {@link Collection#withPivot withPivot}.
     *
     * @example
     * const Account = bookshelf.model('Account', {
     *   tableName: 'accounts'
     * })
     *
     * const User = bookshelf.model('User', {
     *   tableName: 'users',
     *   allAccounts() {
     *     return this.belongsToMany('Account')
     *   },
     *   adminAccounts() {
     *     return this.belongsToMany('Account').query({where: {access: 'admin'}})
     *   },
     *   viewAccounts() {
     *     return this.belongsToMany('Account').query({where: {access: 'readonly'}})
     *   }
     * })
     *
     * @method  Model#belongsToMany
     * @param {Model|string} Target
     *   Constructor of {@link Model} targeted by join. Can be a string specifying a previously registered model with
     *   {@link Bookshelf#model}.
     * @param {string} [joinTableName]
     *   Name of the joining table. Defaults to the two table names ordered alphabetically and
     *   joined by an underscore.
     * @param {string} [foreignKey]
     *   Foreign key in this model. By default, the `foreignKey` is assumed to be the singular form
     *   of this model's tableName, followed by `_id` / `_{{{@link Model#idAttribute idAttribute}}}`.
     * @param {string} [otherKey]
     *   Foreign key in the `Target` model. By default, this is assumed to be the singular form of
     *   the `Target` model's tableName, followed by `_id` /
     *   `_{{{@link Model#idAttribute idAttribute}}}`.
     * @param {string} [foreignKeyTarget]
     *   Column in this model's table which `foreignKey` references. This is only needed if it's not
     *   the default `id` / `{@link Model#idAttribute idAttribute}`.
     * @param {string} [otherKeyTarget]
     *   Column in the `Target` model's table which `otherKey` references. This is only needed, if
     *   it's not the expected default of the `Target` model's `id` /
     *   `{@link Model#idAttribute idAttribute}`.
     * @returns {Collection}
     *   A new empty collection that is decorated with extra pivot helper methods. See the
     *   description below for more info.
     */
    belongsToMany(Target, joinTableName, foreignKey, otherKey, foreignKeyTarget, otherKeyTarget) {
      return this._relation('belongsToMany', Target, {
        joinTableName,
        foreignKey,
        otherKey,
        foreignKeyTarget,
        otherKeyTarget
      }).init(this);
    },

    /**
     * The {@link Model#morphOne morphOne} is used to signify a {@link oneToOne
     * one-to-one} {@link polymorphicRelation polymorphic relation} with
     * another `Target` model, where the `name` of the model is used to determine
     * which database table keys are used. The naming convention requires the
     * `name` prefix an `_id` and `_type` field in the database. So for the case
     * below the table names would be `imageable_type` and `imageable_id`. The
     * `morphValue` may be optionally set to store/retrieve a different value in
     * the `_type` column than the {@link Model#tableName}.
     *
     *     let Site = bookshelf.model('Site', {
     *       tableName: 'sites',
     *       photo: function() {
     *         return this.morphOne('Photo', 'imageable');
     *       }
     *     });
     *
     * And with custom `columnNames`:
     *
     *     let Site = bookshelf.model('Site', {
     *       tableName: 'sites',
     *       photo: function() {
     *         return this.morphOne('Photo', 'imageable', ['ImageableType', 'ImageableId']);
     *       }
     *     });
     *
     * Note that both `columnNames` and `morphValue` are optional arguments. How
     * your argument is treated when only one is specified, depends on the type.
     * If your argument is an array, it will be assumed to contain custom
     * `columnNames`. If it's not, it will be assumed to indicate a `morphValue`.
     *
     * @method Model#morphOne
     * @param {Model|string} Target
     *   Constructor of {@link Model} targeted by join. Can be a string specifying a previously registered model with
     *   {@link Bookshelf#model}.
     * @param {string} [name] Prefix for `_id` and `_type` columns.
     * @param {(string[])} [columnNames]
     *   Array containing two column names, the first is the `_type` while the second is the `_id`.
     * @param {string} [morphValue=Target#{@link Model#tableName tableName}]
     *   The string value associated with this relationship. Stored in the `_type` column of the polymorphic table.
     *   Defaults to `Target#{@link Model#tableName tableName}`.
     * @returns {Model} The related model.
     */
    morphOne(Target, name, columnNames, morphValue) {
      return this._morphOneOrMany(Target, name, columnNames, morphValue, 'morphOne');
    },

    /**
     * {@link Model#morphMany morphMany} is essentially the same as a {@link
     * Model#morphOne morphOne}, but creating a {@link Collection collection}
     * rather than a {@link Model model} (similar to a {@link Model#hasOne
     * hasOne} vs. {@link Model#hasMany hasMany} relation).
     *
     * {@link Model#morphMany morphMany} is used to signify a {@link oneToMany
     * one-to-many} or {@link manyToMany many-to-many} {@link polymorphicRelation
     * polymorphic relation} with another `Target` model, where the `name` of the
     * model is used to determine which database table keys are used. The naming
     * convention requires the `name` prefix an `_id` and `_type` field in the
     * database. So for the case below the table names would be `imageable_type`
     * and `imageable_id`. The `morphValue` may be optionally set to
     * store/retrieve a different value in the `_type` column than the `Target`'s
     * {@link Model#tableName tableName}.
     *
     *     let Post = bookshelf.model('Post', {
     *       tableName: 'posts',
     *       photos: function() {
     *         return this.morphMany('Photo', 'imageable');
     *       }
     *     });
     *
     * And with custom columnNames:
     *
     *     let Post = bookshelf.model('Post'{
     *       tableName: 'posts',
     *       photos: function() {
     *         return this.morphMany('Photo', 'imageable', ['ImageableType', 'ImageableId']);
     *       }
     *     });
     *
     * @method Model#morphMany
     * @param {Model|string} Target
     *   Constructor of {@link Model} targeted by join. Can be a string specifying a previously registered model with
     *   {@link Bookshelf#model}.
     * @param {string} [name] Prefix for `_id` and `_type` columns.
     * @param {(string[])} [columnNames]
     *   Array containing two column names, the first is the `_type` while the second is the `_id`.
     * @param {string} [morphValue=Target#{@link Model#tableName tablename}]
     *   The string value associated with this relationship. Stored in the `_type` column of the polymorphic table.
     *   Defaults to `Target`#{@link Model#tableName tablename}.
     * @returns {Collection} A collection of related models.
     */
    morphMany(Target, name, columnNames, morphValue) {
      return this._morphOneOrMany(Target, name, columnNames, morphValue, 'morphMany');
    },

    /**
     * This relation is used to specify the inverse of the {@link Model#morphOne morphOne} or
     * {@link Model#morphMany morphMany} relations, where the `targets` must be passed to signify which
     * {@link Model models} are the potential opposite end of the {@link polymorphicRelation polymorphic relation}:
     *
     *     const Photo = bookshelf.model('Photo', {
     *       tableName: 'photos',
     *       imageable() {
     *         return this.morphTo('imageable', 'Site', 'Post')
     *       }
     *     })
     *
     * And with custom column names:
     *
     *     const Photo = bookshelf.model('Photo', {
     *       tableName: 'photos',
     *       imageable() {
     *         return this.morphTo('imageable', ['ImageableType', 'ImageableId'], 'Site', 'Post')
     *       }
     *     })
     *
     * And with custom morphValues, the inverse of the `morphValue` of {@link Model#morphOne morphOne} and
     * {@link Model#morphMany morphMany}, where the `morphValues` may be optionally set to check against a different
     * value in the `_type` column other than the {@link Model#tableName}, for example, a more descriptive name, or a
     * name that betters adheres to whatever standard you are using for models:
     *
     *     const Photo = bookshelf.model('Photo', {
     *       tableName: 'photos',
     *       imageable() {
     *         return this.morphTo('imageable', ['Site', 'favicon'], ['Post', 'cover_photo'])
     *       }
     *     })
     *
     * @method Model#morphTo
     * @param {string} name Prefix for `_id` and `_type` columns.
     * @param {string[]} [columnNames]
     *   Array containing two column names, where the first is the `_type` and the second is the `_id`.
     * @param {Model|string} [Target]
     *   Constructor of {@link Model} targeted by join. Can be a string specifying a previously registered model with
     *   {@link Bookshelf#model}.
     * @returns {Model} The related but empty model.
     */
    morphTo(morphName) {
      if (!_.isString(morphName)) throw new Error('The `morphTo` name must be specified.');
      let columnNames, candidates;
      if (arguments[1] == null || (Array.isArray(arguments[1]) && _.isString(arguments[1][0]))) {
        columnNames = arguments[1] || null; // may be `null` or `undefined`
        candidates = _.drop(arguments, 2);
      } else {
        columnNames = null;
        candidates = _.drop(arguments, 1);
      }

      candidates = _.map(candidates, (target) => {
        if (Array.isArray(target)) return target;

        // Set up the morphValue by default as the tableName
        return [target, _.result(target.prototype, 'tableName')];
      });

      return this._relation('morphTo', null, {morphName, columnNames, candidates}).init(this);
    },

    /**
     * Helps to create dynamic relations between {@link Model models} where a {@link Model#hasOne hasOne} or
     * {@link Model#belongsTo belongsTo} relation may run through another `Interim` model. This is exactly like the
     * equivalent {@link Collection#through collection method} except that it applies to the models that the above
     * mentioned relation methods return instead of collections.
     *
     * This method creates a pivot model, which it assigns to {@link Model#pivot model.pivot} after it is created. When
     * serializing the model with {@link Model#toJSON toJSON}, the pivot model is flattened to values prefixed with
     * `_pivot_`.
     *
     * A good example of where this would be useful is if a paragraph {@link Model#hasMany belongTo} a book *through* a
     * chapter. See the example above on how this can be expressed.
     *
     * @method Model#through
     * @example
     * const Chapter = bookshelf.model('Chapter', {
     *   tableName: 'chapters',
     *   paragraphs() {
     *     return this.hasMany('Paragraph')
     *   }
     * })

     * const Book = bookshelf.model('Book', {
     *   tableName: 'books',
     *   chapters() {
     *     return this.hasMany('Chapter')
     *   }
     * })
     *
     const Paragraph = bookshelf.model('Paragraph', {
     *   tableName: 'paragraphs',
     *   chapter() {
     *     return this.belongsTo('Chapter')
     *   },
     *
     *   // Find the book where this paragraph is included, by passing through
     *   // the "Chapter" model.
     *   book() {
     *     return this.belongsTo('Book').through('Chapter')
     *   }
     * })
     *
     * @param {Model|string} Interim
     *   Pivot model. Can be a string specifying a previously registered model with {@link Bookshelf#model}.
     * @param {string} [throughForeignKey]
     *   Foreign key in this model. By default, the foreign key is assumed to be the singular form of the `Target`
     *   model's tableName, followed by `_id` or `_{{{@link Model#idAttribute idAttribute}}}`.
     * @param {string} [otherKey]
     *   Foreign key in the `Interim` model. By default, the other key is assumed to be the singular form of this
     *   model's tableName, followed by `_id` / `_{{{@link Model#idAttribute idAttribute}}}`.
     * @param {string} [throughForeignKeyTarget]
     *   Column in the `Target` model which `throughForeignKey` references, if other than `Target` model's `id` /
     *   `{@link Model#idAttribute idAttribute}`.
     * @param {string} [otherKeyTarget]
     *   Column in this model which `otherKey` references, if other than `id` / `{@link Model#idAttribute idAttribute}`.
     * @returns {Model} The related but empty Model.
     */
    through(Interim, throughForeignKey, otherKey, throughForeignKeyTarget, otherKeyTarget) {
      return this.relatedData.through(this, Interim, {
        throughForeignKey,
        otherKey,
        throughForeignKeyTarget,
        otherKeyTarget
      });
    },

    /**
     * @method Model#refresh
     * @since 0.8.2
     * @description
     *
     * Update the attributes of a model, fetching it by its primary key. If no
     * attribute matches its {@link Model#idAttribute idAttribute}, then fetch by
     * all available fields.
     *
     * @param {Object} options
     *   A hash of options. See {@link Model#fetch} for details.
     * @returns {Promise<Model>}
     *   A promise resolving to this model.
     */
    refresh(options) {
      // If this is new, we use all its attributes. Otherwise we just grab the primary key.
      const attributes = this.isNew() ? this.attributes : _.pick(this.attributes, this.idAttribute);
      return this._doFetch(attributes, options);
    },

    /**
     * This method is similar to {@link Model#fetchAll}, but fetches a single page of results as
     * specified by the limit (page size) and offset (page number).
     *
     * Any options that may be passed to {@link Model#fetchAll} may also be passed in the options
     * to this method. Additionally, to perform pagination, you may include **either** an `offset`
     * and `limit`, **or** a `page` and `pageSize`.
     *
     * By default, with no parameters or some missing parameters, `fetchPage` will use default
     * values of `{page: 1, pageSize: 10}`.
     *
     * @example
     * Car
     *   .query(function(qb) {
     *     qb.innerJoin('manufacturers', 'cars.manufacturer_id', 'manufacturers.id')
     *     qb.groupBy('cars.id')
     *     qb.where('manufacturers.country', '=', 'Sweden')
     *   })
     *   .fetchPage({
     *     pageSize: 15, // Defaults to 10 if not specified
     *     page: 3, // Defaults to 1 if not specified
     *     withRelated: ['engine'] // Passed to Model#fetchAll
     *   })
     *   .then(function(results) {
     *     console.log(results) // Paginated results object with metadata example below
     *   })
     *
     * // Pagination results:
     * {
     *   models: [
     *     // Regular bookshelf Collection
     *   ],
     *   // other standard Collection attributes
     *   // ...
     *   pagination: {
     *     rowCount: 53, // Total number of rows found for the query before pagination
     *     pageCount: 4, // Total number of pages of results
     *     page: 3, // The requested page number
     *     pageSize: 15 // The requested number of rows per page
     *    }
     * }
     *
     * @method Model#fetchPage
     * @param {Object} [options]
     *   Besides the basic options that can be passed to {@link Model#fetchAll}, there are some additional pagination
     *   options that can be specified.
     * @param {number} [options.pageSize]
     *   How many models to include in each page, defaulting to 10 if not specified. Used only together with the `page`
     *   option.
     * @param {number} [options.page]
     *   Page number to retrieve. If greater than the available rows it will return an empty Collection. The first page
     *   is number `1`. Used only with the `pageSize` option.
     * @param {number} [options.limit]
     *   How many models to include in each page, defaulting to 10 if not specified. Used only together with the
     *   `offset` option.
     * @param {number} [options.offset]
     *   Index to begin fetching results from. The default and initial value is `0`. Used only with the `limit` option.
     * @returns {Promise<Collection>}
     *   Returns a Promise that will resolve to the paginated collection of models. Note that if there are no results
     *   the return value will be an empty Collection.
     */
    fetchPage(options) {
      if (!options) options = {};
      return Helpers.fetchPage.call(this, options);
    },

    /**
     * Fetches a {@link Model model} from the database, using any {@link
     * Model#attributes attributes} currently set on the model to form a `select`
     * query.
     *
     * A {@link Model#event:fetching "fetching"} event will be fired just before the
     * record is fetched; a good place to hook into for validation. {@link
     * Model#event:fetched "fetched"} event will be fired when a record is
     * successfully retrieved.
     *
     * If you need to constrain the query
     * performed by fetch, you can call {@link Model#query query} before calling
     * {@link Model#fetch fetch}.
     *
     *     // select * from `books` where `ISBN-13` = '9780440180296'
     *     new Book({'ISBN-13': '9780440180296'})
     *       .fetch()
     *       .then(function(model) {
     *         // outputs 'Slaughterhouse Five'
     *         console.log(model.get('title'));
     *       });
     *
     * _If you'd like to only fetch specific columns, you may specify a `columns`
     * property in the `options` for the {@link Model#fetch fetch} call, or use
     * {@link Model#query query}, tapping into the {@link Knex} {@link
     * Knex#column column} method to specify which columns will be fetched._
     *
     * A single property, or an array of properties can be specified as a value for
     * the `withRelated` property. You can also execute callbacks on relations
     * queries (eg. for sorting a relation). The results of these relation queries
     * will be loaded into a {@link Model#relations relations} property on the
     * model, may be retrieved with the {@link Model#related related} method, and
     * will be serialized as properties on a {@link Model#toJSON toJSON} call
     * unless `{shallow: true}` is passed.
     *
     *     let Book = bookshelf.model('Book', {
     *       tableName: 'books',
     *       editions: function() {
     *         return this.hasMany('Edition');
     *       },
     *       chapters: function() {
     *         return this.hasMany('Chapter');
     *       },
     *       genre: function() {
     *         return this.belongsTo('Genre');
     *       }
     *     })
     *
     *     new Book({'ISBN-13': '9780440180296'}).fetch({
     *       withRelated: [
     *         'genre', 'editions',
     *         { chapters: function(query) { query.orderBy('chapter_number'); }}
     *       ]
     *     }).then(function(book) {
     *       console.log(book.related('genre').toJSON());
     *       console.log(book.related('editions').toJSON());
     *       console.log(book.toJSON());
     *     });
     *
     * @method Model#fetch
     *
     * @param {Object=}  options - Hash of options.
     * @param {Boolean=} [options.require=false]
     *   Reject the returned response with a {@link Model.NotFoundError
     *   NotFoundError} if results are empty.
     * @param {string|string[]} [options.columns='*']
     *   Specify columns to be retrieved.
     * @param {Transaction} [options.transacting]
     *  Optionally run the query in a transaction.
     * @param {string} [options.lock]
     *  Type of row-level lock to use. Valid options are `forShare` and
     *  `forUpdate`. This only works in conjunction with the `transacting`
     *  option, and requires a database that supports it.
     * @param {string|Object|mixed[]} [options.withRelated]
     *  Relations to be retrieved with `Model` instance. Either one or more
     *  relation names or objects mapping relation names to query callbacks.
     *
     * @fires Model#fetching
     * @fires Model#fetched
     *
     * @throws {Model.NotFoundError}
     *
     * @returns {Promise<Model|null>}
     *  A promise resolving to the fetched {@link Model model} or `null` if
     *  none exists.
     *
     */
    fetch(options) {
      return this._doFetch(this.attributes, options);
    },

    _doFetch: Promise.method(function(attributes, options) {
      options = options ? _.clone(options) : {};

      // Run the `first` call on the `sync` object to fetch a single model.
      return (
        this.sync(options)
          .first(attributes)
          .bind(this)

          // Jump the rest of the chain if the response doesn't exist...
          .tap(function(response) {
            if (!response || response.length === 0) {
              throw new this.constructor.NotFoundError('EmptyResponse');
            }
          })

          // Now, load all of the data into the model as necessary.
          .tap(this._handleResponse)

          // If the "withRelated" is specified, we also need to eager load all of the
          // data on the model, as a side-effect, before we ultimately jump into the
          // next step of the model. Since the `columns` are only relevant to the
          // current level, ensure those are omitted from the options.
          .tap(function(response) {
            if (options.withRelated) {
              return this._handleEager(response, _.omit(options, 'columns'));
            }
          })

          .tap(function(response) {
            /**
             * Fired after a `fetch` operation. A promise may be returned from the
             * event handler for async behaviour.
             *
             * @event Model#fetched
             * @tutorial events
             * @param {Model} model
             *   The model firing the event.
             * @param {Object} response
             *   Knex query response.
             * @param {Object} options
             *   Options object passed to {@link Model#fetch fetch}.
             * @returns {Promise}
             *   If the handler returns a promise, `fetch` will wait for it to
             *   be resolved.
             */
            return this.triggerThen('fetched', this, response, options);
          })
          .return(this)
          .catch(this.constructor.NotFoundError, function(err) {
            if (options.require) {
              throw err;
            }
            return null;
          })
      );
    }),

    // Private for now.
    all() {
      const collection = this.constructor.collection();
      collection._knex = this.query().clone();
      this.resetQuery();
      if (this.relatedData) collection.relatedData = this.relatedData;
      return collection;
    },

    /**
     * @method Model#count
     * @since 0.8.2
     * @description
     *
     * Gets the number of matching records in the database, respecting any
     * previous calls to {@link Model#query}.
     *
     * @example
     *
     * Duck.where('color', 'blue').count('name')
     *   .then(function(count) { //...
     *
     * @param {string} [column='*']
     *   Specify a column to count - rows with null values in this column will be excluded.
     * @param {Object=} options
     *   Hash of options.
     * @returns {Promise<Number>}
     *   A promise resolving to the number of matching rows.
     */
    count(column, options) {
      return this.all().count(column, options);
    },

    /**
     * Fetches a collection of {@link Model models} from the database, using any
     * query parameters currently set on the model to form a select query. Returns
     * a Promise, which will resolve with the fetched collection. If you wish to
     * trigger an error if no models are found, pass `{require: true}` as one of
     * the options.
     *
     * If you need to constrain the query performed by fetch, you can call the
     * {@link Model#query query} method before calling fetch.
     *
     * @method Model#fetchAll
     * @param {Object} [options] Set of options to modify the request.
     * @param {Boolean} [options.require=false]
     *   Rejects the returned Promise with a {@link Collection.EmptyError} if no records can be
     *   fetched from the databse.
     * @param {Transaction} [options.transacting] Optionally run the query in a transaction.
     * @fires Model#fetching:collection
     * @fires Model#fetched:collection
     * @throws {Collection.EmptyError}
     *   This error is used to reject the Promise in the event of an empty response from the
     *   database if the `require: true` option is used.
     * @returns {Promise} A Promise resolving to the fetched {@link Collection collection}.
     */
    fetchAll(options) {
      const collection = this.all();
      return collection
        .once('fetching', (__, columns, opts) => {
          /**
           * Fired before a {@link Model#fetchAll fetchAll} operation. A promise
           * may be returned from the event handler for async behaviour.
           *
           * @event Model#fetching:collection
           * @tutorial events
           * @param {Collection} collection
           *  The collection that is going to be fetched. At this point it's still empty since the
           *  fetch hasn't happened yet.
           * @param {string[]} columns
           *  The columns to be retrieved by the query as provided by the underlying query builder.
           *  If the `columns` option is not specified the value of this will usually be an array
           *  with a single string `'tableName.*'`.
           * @param {Object} options Options object passed to {@link Model#fetchAll fetchAll}.
           * @returns {Promise}
           */
          return this.triggerThen('fetching:collection', collection, columns, opts);
        })
        .once('fetched', (__, response, opts) => {
          /**
           * Fired after a {@link Model#fetchAll fetchAll} operation. A promise
           * may be returned from the event handler for async behaviour.
           *
           * @event Model#fetched:collection
           * @tutorial events
           * @param {Collection} collection The collection that has been fetched.
           * @param {Object} response
           *  The raw response from the underlying query builder. This will be an array with objects
           *  representing each row, similar to the output of a
           *  {@link Model#serialize serialized Model}.
           * @param {Object} options Options object passed to {@link Model#fetchAll fetchAll}.
           * @returns {Promise}
           */
          return this.triggerThen('fetched:collection', collection, response, opts);
        })
        .fetch(options);
    },

    /**
     * The load method takes an array of relations to eager load attributes onto a {@link Model}, in a similar way that
     * the `withRelated` option works on {@link Model#fetch fetch}. Dot separated attributes may be used to specify deep
     * eager loading.
     *
     * It is possible to pass an object with query callbacks to filter the relations to eager load. An example is
     * presented above.
     *
     * @example
     * // Using an array of strings with relation names
     * new Posts().fetch().then(function(collection) {
     *   return collection.at(0).load(['author', 'content', 'comments.tags'])
     * }).then(function(model) {
     *   JSON.stringify(model)
     *
     *   // {
     *   //   title: 'post title',
     *   //   author: {...},
     *   //   content: {...},
     *   //   comments: [
     *   //     {tags: [...]}, {tags: [...]}
     *   //   ]
     *   // }
     * })
     *
     * // Using an object with query callbacks to filter the relations
     * new Posts().fetch().then(function(collection) {
     *   return collection.at(0).load({comments: function(qb) {
     *     qb.where('comments.is_approved', '=', true)
     *   }})
     * }).then(function(model) {
     *   JSON.stringify(model)
     *   // the model now includes all approved comments
     * })
     *
     * @method Model#load
     * @param {string|Object|mixed[]} relations The relation, or relations, to be loaded.
     * @param {Object} [options] Hash of options.
     * @param {Transaction} [options.transacting] Optionally run the query in a transaction.
     * @param {string} [options.lock]
     *   Type of row-level lock to use. Valid options are `forShare` and `forUpdate`. This only works in conjunction
     *   with the `transacting` option, and requires a database that supports it.
     * @returns {Promise<Model>} A promise resolving to this {@link Model model}.
     */
    load: Promise.method(function(relations, options) {
      const columns = this.format(_.assignIn({}, this.attributes));
      const withRelated = Array.isArray(relations) ? relations : [relations];
      return this._handleEager([columns], _.assignIn({}, options, {shallow: true, withRelated})).return(this);
    }),

    /**
     * @method Model#save
     * @description
     *
     * This method is used to perform either an insert or update query using the
     * model's set {@link Model#attributes attributes}.
     *
     * If the model {@link Model#isNew isNew}, any {@link Model#defaults defaults}
     * will be set and an `insert` query will be performed. Otherwise it will
     * `update` the record with a corresponding ID. It is also possible to
     * set default attributes on an `update` by passing the `{defaults: true}`
     * option in the second argument to the `save` call. This will also use the
     * same {@link Model#defaults defaults} as the `insert` operation.
     *
     * The type of operation to perform (either `insert` or `update`) can be
     * overriden with the `method` option:
     *
     *     // This forces an insert with the specified id instead of the expected
     *     // update
     *     new Post({name: 'New Article', id: 34})
     *       .save(null, {method: 'insert'})
     *       .then(function(model) {
     *         // ...
     *       });
     *
     * If you only wish to update with the params passed to the save, you may pass
     * a `{patch: true}` option in the second argument to `save`:
     *
     *     // UPDATE authors SET "bio" = 'Short user bio' WHERE "id" = 1
     *     new Author({id: 1, first_name: 'User'})
     *       .save({bio: 'Short user bio'}, {patch: true})
     *       .then(function(model) {
     *         // ...
     *       });
     *
     * Several events fire on the model when saving: a {@link Model#event:creating
     * "creating"}, or {@link Model#event:updating "updating"} event if the model is
     * being inserted or updated, and a "saving" event in either case.
     *
     * To prevent saving the model (for example, with validation), throwing an error
     * inside one of these event listeners will stop saving the model and reject the
     * promise.
     *
     * A {@link Model#event:created "created"}, or {@link Model#event:updated "updated"}
     * event is fired after the model is saved, as well as a {@link Model#event:saved "saved"}
     * event either way. If you wish to modify the query when the {@link Model#event:saving
     * "saving"} event is fired, the knex query object is available in `options.query`.
     *
     * See the {@tutorial events} guide for further details.
     *
     * @example
     * // Save with no arguments
     * Model.forge({id: 5, firstName: 'John', lastName: 'Smith'}).save().then(function() {
     *   //...
     * });
     *
     * // Or add attributes during save
     * Model.forge({id: 5}).save({firstName: 'John', lastName: 'Smith'}).then(function() {
     *   //...
     * });
     *
     * // Or, if you prefer, for a single attribute
     * Model.forge({id: 5}).save('name', 'John Smith').then(function() {
     *   //...
     * });
     *
     * @param {string=}      key                      Attribute name.
     * @param {string=}      val                      Attribute value.
     * @param {Object=}      attrs                    A hash of attributes.
     * @param {Object=}      options
     * @param {Transaction=} options.transacting
     *   Optionally run the query in a transaction.
     * @param {string=} options.method
     *   Explicitly select a save method, either `"update"` or `"insert"`.
     * @param {Boolean} [options.defaults=false]
     *   Whether to assign or not {@link Model#defaults default} attribute values
     *   on a model when performing an update or create operation.
     * @param {Boolean} [options.patch=false]
     *   Only save attributes supplied in arguments to `save`.
     * @param {Boolean} [options.require=true]
     *   Throw a {@link Model.NoRowsUpdatedError} if no records are affected by save.
     *
     * @fires Model#saving
     * @fires Model#creating
     * @fires Model#updating
     * @fires Model#created
     * @fires Model#updated
     * @fires Model#saved
     *
     * @throws {Model.NoRowsUpdatedError}
     *
     * @returns {Promise<Model>} A promise resolving to the saved and updated model.
     */
    save: Promise.method(function(key, val, options) {
      let attrs;

      // Handle both `"key", value` and `{key: value}` -style arguments.
      if (key == null || typeof key === 'object') {
        attrs = key || {};
        options = _.clone(val) || {};
      } else {
        attrs = {
          [key]: val
        };
        options = options ? _.clone(options) : {};
      }

      return Promise.bind(this)
        .then(function() {
          return this.saveMethod(options);
        })
        .then(function(method) {
          // Determine which kind of save we will do: update or insert.
          options.method = method;

          // If the object is being created, we merge any defaults here rather than
          // during object creation.
          if (method === 'insert' || options.defaults) {
            const defaults = _.result(this, 'defaults');
            if (defaults) {
              attrs = _.defaultsDeep({}, attrs, this.attributes, defaults);
            }
          }

          // Set the attributes on the model. Note that we do this before adding
          // timestamps, as `timestamp` calls `set` internally.
          this.set(attrs, {silent: true});

          // Now set timestamps if appropriate. Extend `attrs` so that the
          // timestamps will be provided for a patch operation.
          if (this.hasTimestamps) {
            Object.assign(attrs, this.timestamp(options));
          }

          // If there are any save constraints, set them on the model.
          if (this.relatedData && this.relatedData.type !== 'morphTo') {
            Helpers.saveConstraints(this, this.relatedData);
          }

          const attributesToSave = method === 'update' && options.patch ? attrs : this.attributes;

          // Gives access to the `query` object in the `options`, in case we need it
          // in any event handlers.
          const sync = this.sync(options);
          options.query = sync.query;

          /**
           * Saving event.
           *
           * Fired before an `insert` or `update` query. A Promise may be returned from the event
           * handler for async behaviour. Throwing an exception from the handler will cancel the
           * save process.
           *
           * @event Model#saving
           * @tutorial events
           * @param {Model} model
           *   The model firing the event. Its attributes are already changed but not commited to
           *   the database yet.
           * @param {Object} attrs Attributes that will be inserted or updated.
           * @param {Object} options Options object passed to {@link Model#save save}.
           * @param {QueryBuilder} options.query
           *   Query builder to be used for saving. This can be used to modify or add to the query
           *   before it is executed.
           * @returns {Promise}
           */

          /**
           * Creating event.
           *
           * Fired before an `insert` query. A Promise may be returned from the event handler for
           * async behaviour. Throwing an exception from the handler will cancel the save process.
           *
           * @event Model#creating
           * @tutorial events
           * @param {Model} model The model firing the event.
           * @param {Object} attrs Attributes that will be inserted.
           * @param {Object} options Options object passed to {@link Model#save save}.
           * @param {QueryBuilder} options.query
           *   Query builder to be used for saving. This can be used to modify or add to the query
           *   before it is executed.
           * @returns {Promise}
           */

          /**
           * Updating event.
           *
           * Fired before an `update` query. A Promise may be returned from the event handler for
           * async behaviour. Throwing an exception from the handler will cancel the save process.
           *
           * @event Model#updating
           * @tutorial events
           * @param {Model} model
           *   The model firing the event. Its attributes are already changed but not commited to
           *   the database yet.
           * @param {Object} attrs Attributes that will be updated.
           * @param {Object} options Options object passed to {@link Model#save save}.
           * @param {QueryBuilder} options.query
           *   Query builder to be used for saving. This can be used to modify or add to the query
           *   before it is executed.
           * @returns {Promise}
           */
          return this.triggerThen(
            method === 'insert' ? 'saving creating' : 'saving updating',
            this,
            attributesToSave,
            options
          )
            .bind(this)
            .then(function() {
              return sync[options.method](attributesToSave);
            })
            .then(function(resp) {
              // After a successful database save, the id is updated if the model was created
              if (method === 'insert' && this.id == null) {
                const updatedCols = {};
                updatedCols[this.idAttribute] = this.id = resp[0];
                const updatedAttrs = this.parse(updatedCols);
                Object.assign(this.attributes, updatedAttrs);
              } else if (method === 'update' && resp === 0) {
                if (options.require !== false) {
                  throw new this.constructor.NoRowsUpdatedError('No Rows Updated');
                }
              }

              this._reset();

              /**
               * Saved event.
               *
               * Fired after an `insert` or `update` query.
               *
               * @event Model#saved
               * @tutorial events
               * @param {Model} model The model firing the event.
               * @param {(Array|Number)} response
               *   A list containing the id of the newly created model in case of an
               *   `insert` or a number representing the affected rows in the case of
               *   an `update` query.
               * @param {Object} options Options object passed to {@link Model#save save}.
               * @returns {Promise}
               */

              /**
               * Created event.
               *
               * Fired after an `insert` query.
               *
               * @event Model#created
               * @tutorial events
               * @param {Model}  model    The model firing the event.
               * @param {Array}  newId    A list containing the id of the newly created model.
               * @param {Object} options  Options object passed to {@link Model#save save}.
               * @returns {Promise}
               */

              /**
               * Updated event.
               *
               * Fired after an `update` query.
               *
               * @event Model#updated
               * @tutorial events
               * @param {Model} model The model firing the event.
               * @param {Number} affectedRows Number of rows affected by the update.
               * @param {Object} options Options object passed to {@link Model#save save}.
               * @returns {Promise}
               */
              return this.triggerThen(method === 'insert' ? 'created saved' : 'updated saved', this, resp, options);
            });
        })
        .return(this);
    }),

    /**
     * `destroy` performs a `delete` on the model, using the model's {@link
     * Model#idAttribute idAttribute} to constrain the query.
     *
     * A {@link Model#event:destroying "destroying"} event is triggered on the model
     * before being destroyed. To prevent destroying the model, throwing an error
     * inside one of the event listeners will stop destroying the model and reject the
     * promise.
     *
     * A {@link Model#event:destroyed "destroyed"} event is fired after the model's
     * removal is completed.
     *
     * @method Model#destroy
     *
     * @param {Object=}      options                  Hash of options.
     * @param {Transaction=} options.transacting      Optionally run the query in a transaction.
     * @param {Boolean} [options.require=true]
     *   Throw a {@link Model.NoRowsDeletedError} if no records are affected by destroy. This is
     *   the default behavior as of version 0.13.0.
     *
     * @example
     *
     * new User({id: 1})
     *   .destroy()
     *   .then(function(model) {
     *     // ...
     *   });
     *
     * @fires Model#destroying
     * @fires Model#destroyed
     *
     * @throws {Model.NoRowsDeletedError}
     *
     * @returns {Promise<Model>} A promise resolving to the destroyed and thus
     *                           empty model, i.e. all attributes are `undefined`.
     */
    destroy: Promise.method(function(options) {
      options = options ? _.clone(options) : {};
      const sync = this.sync(options);
      options.query = sync.query;
      return Promise.bind(this)
        .then(function() {
          /**
           * Destroying event.
           *
           * Fired before a `delete` query. A promise may be returned from the event
           * handler for async behaviour. Throwing an exception from the handler
           * will reject the promise and cancel the deletion.
           *
           * @event Model#destroying
           * @tutorial events
           * @param {Model}  model    The model firing the event.
           * @param {Object} options  Options object passed to {@link Model#destroy destroy}.
           * @returns {Promise}
           */
          return this.triggerThen('destroying', this, options);
        })
        .then(function() {
          return sync.del();
        })
        .then(function(affectedRows) {
          if (options.require !== false && affectedRows === 0) {
            throw new this.constructor.NoRowsDeletedError('No Rows Deleted');
          }

          this._previousAttributes = _.clone(this.attributes);
          this.clear();

          /**
           * Destroyed event.
           *
           * Fired after a `delete` query. A promise may be returned from the event
           * handler for async behaviour.
           *
           * @event Model#destroyed
           * @tutorial events
           * @param {Model}  model The model firing the event.
           * @param {Object} options Options object passed to {@link Model#destroy destroy}.
           * @returns {Promise}
           */
          return this.triggerThen('destroyed', this, options);
        })
        .then(this._reset);
    }),

    /**
     *  Used to reset the internal state of the current query builder instance.
     *  This method is called internally each time a database action is completed
     *  by {@link Sync}
     *
     *  @method Model#resetQuery
     *  @returns {Model}          Self, this method is chainable.
     */
    resetQuery() {
      this._knex = null;
      return this;
    },

    /**
     * The `query` method is used to tap into the underlying Knex query builder
     * instance for the current model. If called with no arguments, it will
     * return the query builder directly. Otherwise, it will call the specified
     * method on the query builder, applying any additional arguments from the
     * `model.query` call. If the method argument is a function, it will be
     * called with the Knex query builder as the context and the first argument,
     * returning the current model.
     *
     * @example
     *
     * model
     *   .query('where', 'other_id', '=', '5')
     *   .fetch()
     *   .then(function(model) {
     *     // ...
     *   });
     *
     * model
     *   .query({where: {other_id: '5'}, orWhere: {key: 'value'}})
     *   .fetch()
     *   .then(function(model) {
     *     // ...
     *   });
     *
     * model.query(function(qb) {
     *   qb.where('other_person', 'LIKE', '%Demo').orWhere('other_id', '>', 10);
     * }).fetch()
     *   .then(function(model) {
     *     // ...
     *   });
     *
     * let qb = model.query();
     * qb.where({id: 1}).select().then(function(resp) {
     *   // ...
     * });
     *
     * @method Model#query
     * @param {function|Object|...string=} arguments The query method.
     * @returns {Model|QueryBuilder}
     *   Will return this model or, if called with no arguments, the underlying query builder.
     *
     * @see {@link http://knexjs.org/#Builder Knex `QueryBuilder`}
     */
    query() {
      return Helpers.query(this, Array.from(arguments));
    },

    /**
     * The where method is used as convenience for the most common {@link
     * Model#query query} method, adding a where clause to the builder. Any
     * additional knex methods may be accessed using {@link Model#query query}.
     *
     * Accepts either key, value syntax, or a hash of attributes.
     *
     * @example
     *
     * model.where('favorite_color', '<>', 'green').fetch().then(function() { //...
     * // or
     * model.where('favorite_color', 'red').fetch().then(function() { //...
     * // or
     * model.where({favorite_color: 'red', shoe_size: 12}).fetch().then(function() { //...
     *
     * @method Model#where
     * @param {Object|...string} method
     *
     *   Either `key, [operator], value` syntax, or a hash of attributes to
     *   match. Note that these must be formatted as they are in the database,
     *   not how they are stored after {@link Model#parse}.
     *
     * @returns {Model} Self, this method is chainable.
     *
     * @see Model#query
     */
    where() {
      return this.query.apply(this, ['where'].concat(Array.from(arguments)));
    },

    /**
     * @method Model#orderBy
     * @since 0.9.3
     * @description
     *
     * Specifies the column to sort on and sort order.
     *
     * The order parameter is optional, and defaults to 'ASC'. You may
     * also specify 'DESC' order by prepending a hyphen to the sort column
     * name. `orderBy("date", 'DESC')` is the same as `orderBy("-date")`.
     *
     * Unless specified using dot notation (i.e., "table.column"), the default
     * table will be the table name of the model `orderBy` was called on.
     *
     * @example
     *
     * Car.forge().orderBy('color', 'ASC').fetchAll()
     *    .then(function (rows) { // ...
     *
     * @param sort {string}
     *   Column to sort on
     * @param order {string}
     *   Ascending ('ASC') or descending ('DESC') order
     */
    orderBy() {
      return Helpers.orderBy.apply(null, [this].concat(Array.from(arguments)));
    },

    /* Ensure that QueryBuilder is copied on clone. */
    clone() {
      // This needs to use the direct apply method because the spread operator
      // incorrectly converts to `clone.apply(ModelBase.prototype, arguments)`
      // instead of `apply(this, arguments)`
      const cloned = BookshelfModel.__super__.clone.apply(this, arguments);
      if (this._knex != null) {
        cloned._knex = cloned._builder(this._knex.clone());
      }
      return cloned;
    },

    /**
     * Creates and returns a new Bookshelf.Sync instance.
     *
     * @method Model#sync
     * @private
     * @returns Sync
     */
    sync(options) {
      return new Sync(this, options);
    },

    /**
     * Helper for setting up the `morphOne` or `morphMany` relations.
     *
     * @method Model#_morphOneOrMany
     * @private
     */
    _morphOneOrMany(Target, morphName, columnNames, morphValue, type) {
      if (!Array.isArray(columnNames)) {
        // Shift by one place
        morphValue = columnNames;
        columnNames = null;
      }
      if (!morphName || !Target) throw new Error('The polymorphic `name` and `Target` are required.');

      return this._relation(type, Target, {
        morphName: morphName,
        morphValue: morphValue,
        columnNames: columnNames
      }).init(this);
    },

    /**
     * @name Model#_handleResponse
     * @private
     * @description
     *
     *   Handles the response data for the model, returning from the model's fetch call.
     *
     * @param {Object} Response from Knex query.
     *
     * @todo: need to check on Backbone's status there, ticket #2636
     * @todo: {silent: true, parse: true}, for parity with collection#set
     */
    _handleResponse(response) {
      const relatedData = this.relatedData;

      this.set(this.parse(response[0]), {silent: true})
        .formatTimestamps()
        ._reset();
      this._previousAttributes = _.cloneDeep(this.attributes);

      if (relatedData && relatedData.isJoined()) {
        relatedData.parsePivot([this]);
      }
    },

    /**
     * @name Model#_handleEager
     * @private
     * @description
     *
     *   Handles the related data loading on the model.
     *
     * @param {Object} Response from Knex query.
     */
    _handleEager(response, options) {
      return new EagerRelation([this], response, this).fetch(options);
    }
  },
  {
    extended(child) {
      /**
       * @class Model.NotFoundError
       * @description
       *
       *   Thrown when no records are found by {@link Model#fetch fetch} or
       *   {@link Model#refresh} when called with the
       *   `{require: true}` option.
       */
      child.NotFoundError = createError(this.NotFoundError);

      /**
       * @class Model.NoRowsUpdatedError
       * @description
       *
       *   Thrown when no records are saved by {@link Model#save save}
       *   unless called with the `{require: false}` option.
       */
      child.NoRowsUpdatedError = createError(this.NoRowsUpdatedError);

      /**
       * @class Model.NoRowsDeletedError
       * @description
       *
       *   Thrown when no record is deleted by {@link Model#destroy destroy}
       *   if called with the `{require: true}` option.
       */
      child.NoRowsDeletedError = createError(this.NoRowsDeletedError);
    },

    fetchPage() {
      const model = this.forge();
      return model.fetchPage.apply(model, arguments);
    }
  }
);

BookshelfModel.NotFoundError = Errors.NotFoundError;
BookshelfModel.NoRowsUpdatedError = Errors.NoRowsUpdatedError;
BookshelfModel.NoRowsDeletedError = Errors.NoRowsDeletedError;

module.exports = BookshelfModel;
