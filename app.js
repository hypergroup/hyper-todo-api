var stack = require('simple-stack-common');
var uuid = require('uuid').v4;
var mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost/hyper-todo');

var Schema = mongoose.Schema;
var ObjectID = Schema.ObjectId;

var UserS = new Schema({
  'username': String,
  'password': String,
  givenName: String,
  familyName: String,
  avatar: String
});

var CategoryS = new Schema({
  title: String
});

var ItemS = new Schema({
  title: String,
  notes: String,
  public: Boolean,
  created: Date,
  due: Date,
  category: ObjectID,
  owner: ObjectID,
  completed: Date
});

var User = mongoose.model('User', UserS);
var Category = mongoose.model('Category', CategoryS);
var Item = mongoose.model('Item', ItemS);

var app = module.exports = stack({
  base: {
    host: 'x-orig-host',
    path: 'x-orig-path',
    port: 'x-orig-port',
    proto: 'x-orig-proto'
  }
});

app.useBefore('router', function locals(req, res, next) {
  var url = req.base + (req.url === '/' ? '' : req.url);
  res.locals({
    url: url,
    root: req.get('x-root') || req.base
  });
  var _json = res.json;
  res.json = function(data) {
    var root = res.locals.root;
    data.root = {href: root};
    data.href = url;
    _json.call(res, data);
  };
  res.set('cache-control', 'max-age=3600');
  next();
});

app.param('user', function(req, res, next, id) {
  req.userBase = req.base + '/' + id;
  User.findById(id, function(err, user) {
    if (err) return next(err);
    if (!user) return res.send(404);
    res.locals.user = user;
    next();
  });
});

app.param('item', function(req, res, next, id) {
  Item.findById(id, function(err, item) {
    if (err) return next(err);
    if (!item) return res.send(404);
    res.locals.item = item;
    next();
  });
});

app.param('category', function(req, res, next, id) {
  Category.findById(id, function(err, category) {
    if (err) return next(err);
    if (!category) return res.send(404);
    res.locals.category = category;
    next();
  });
});

app.get('/', function(req, res) {
  var t = req.base + '/translations';
  res.json({
    translations: {
      href: t
    },
    signup: {
      method: 'POST',
      action: req.base,
      input: {
        _action: {
          type: 'hidden',
          value: 'signup'
        },
        username: {
          type: 'text',
          required: true,
          placeholder: {
            href: t + '#/username'
          }
        },
        password: {
          type: 'password',
          required: true,
          placeholder: {
            href: t + '#/password'
          }
        },
        'given-name': {
          type: 'text',
          placeholder: {
            href: t + '#/given-name'
          }
        },
        'family-name': {
          type: 'text',
          placeholder: {
            href: t + '#/family-name'
          }
        },
        avatar: {
          type: 'url',
          placeholder: {
            href: t + '#/avatar'
          }
        }
      }
    },
    login: {
      method: 'POST',
      action: req.base,
      input: {
        _action: {
          type: 'hidden',
          value: 'login'
        },
        username: {
          type: 'text',
          required: true,
          placeholder: {
            href: t + '#/username'
          }
        },
        password: {
          type: 'password',
          required: true,
          placeholder: {
            href: t + '#/password'
          }
        }
      }
    }
  });
});

var translations = {
  'en': {
    username: 'Username',
    password: 'Password',
    'given-name': 'Given Name',
    'family-name': 'Family Name',
    'avatar': 'Avatar',
    title: 'Title',
    'signup': 'Sign Up',
    login: 'Log In',
    'todo-title': 'todos',
    cta: 'What needs to be done?',
    count: '%{smart_count} item left |||| %{smart_count} items left',
    logout: 'Logout',
    todos: 'Home',
    'edit-account': 'Profile',
    'delete-account': 'DELETE ACCOUNT',
    'update-account': 'Update',
    all: 'All',
    active: 'Active',
    completed: 'Completed'
  },
  es: {
    username: 'Nombre de usuario',
    password: 'Contraseña',
    'given-name': 'Nombre de pila',
    'family-name': 'Nombre familiar',
    'avatar': 'Encarnación',
    title: 'Titulo',
    signup: 'Inscribirse',
    login: 'Entrada',
    'todo-title': 'para hacer',
    cta: 'Qué se debe hacer',
    count: 'un punto queda |||| %{smart_count} puntos quedan',
    logout: 'Salir',
    todos: 'Inicio',
    'edit-account': 'Profil',
    'delete-account': 'ANULAR',
    'update-account': 'Actualizar',
    all: 'Todos',
    active: 'Activos',
    completed: 'Terminados'
  }
};

app.get('/translations', function(req, res) {
  var langs = req.acceptedLanguages;
  res.set('vary', 'accept-language');
  function acceptable(i) {
    if (i === langs.length) return res.json(translations.en);
    var locale = langs[i];
    var t = translations[locale] || translations[locale.split('-')[0]];
    if (!t) return acceptable(i + 1);
    res.json(t);
  }
  acceptable(0);
});

function bodyToUser(b) {
  var user = {
    username: b.username,
    givenName: b['given-name'] || '',
    familyName: b['family-name'] || '',
    avatar: b.avatar || ''
  };
  if (b.password) user.password = b.password;
  return user;
}

app.post('/', function(req, res, next) {
  var b = req.body;
  if (b._action === 'login') return next('route');
  if (!b.username || !b.password) return res.send(400);
  var user = new User(bodyToUser(b));
  user.save(function(err) {
    if (err) return next(err);
    res.redirect(req.base + '/' + user._id);
  });
});

app.post('/', function(req, res, next) {
  var b = req.body;
  var username = b.username;
  if (!username) return res.send(400);
  User.find({username: username}, function(err, users) {
    if (err) return next(err);
    if (!users || !users[0]) return res.send(404);
    var user = users[0];
    if (user.password !== b.password) return res.send(401);
    res.redirect(req.base + '/' + user._id);
  });
});

app.get('/:user', function(req, res) {
  res.json({
    items: {
      href: req.userBase + '/items'
    },
    categories: {
      href: req.userBase + '/categories'
    },
    account: {
      href: req.userBase + '/account'
    }
  });
});

function findItems(req, res, next) {
  Item.find({owner: res.locals.user}, function(err, items) {
    if (err) return next(err);
    res.locals.items = items;
    next();
  });
}

app.get('/:user/items', findItems, findCategories, function(req, res) {
  var items = res.locals.items;
  var body = {
    collection: items.map(function(item) {
      if (typeof item === 'string') return {href: item};
      return {
        href: req.userBase + '/items/' + item._id
      };
    }),
    count: items.length,
    completedCount: items.reduce(function(count, item) {
      return item.completed ? count + 1 : count;
    }, 0),
    create: {
      method: 'POST',
      action: req.userBase + '/items',
      input: {
        title: {
          type: 'text',
          required: true
        },
        public: {
          type: 'checkbox'
        },
        'due-date': {
          type: 'datetime'
        },
        notes: {
          type: 'text'
        },
        category: {
          type: 'select',
          options: res.locals.categories.map(function(cat) {
            return {
              value: cat._id,
              name: cat.title
            };
          })
        }
      }
    }
  };
  body.active = {collection: [], count: 0};
  body.completed = {collection: [], count: 0};
  items.forEach(function(item) {
    var coll = item.completed ? body.completed : body.active;
    coll.collection.push({
      href: req.userBase + '/items/' + item._id
    });
    coll.count++;
  });
  res.json(body);
});

function bodyToItem(b, isNew) {
  var item = {
    title: b.title || '',
    notes: b.notes || '',
    // TODO categories,
    public: !!b.public,
    due: new Date(b['due-date'] || null)
  };
  if (isNew) item.created = new Date();
  return item;
}

app.post('/:user/items', function(req, res, next) {
  var itemData = bodyToItem(req.body, true);
  itemData.owner = res.locals.user._id;
  var item = new Item(itemData);
  item.save(function(err) {
    if (err) return next(err);
    res.redirect(req.userBase + '/items/' + item._id);
  });
});

function renderItem(req, res) {
  var id = req.params.item;
  var item = res.locals.item;
  var url = req.userBase + '/items/' + id;

  var body = {
    id: id,
    title: item.title,
    'due-date': item.due,
    notes: item.notes,
    public: item.public,
    owner: {
      href: req.base + '/' + item.owner
    },
    created: item.created,
    updated: item.updated,
    completed: item.completed,
    'delete': {
      method: 'DELETE',
      action: url
    },
    update: {
      method: 'POST',
      action: url,
      input: {
        _action: {
          type: 'hidden',
          value: 'update'
        },
        title: {
          type: 'text',
          required: true,
          value: item.title
        },
        public: {
          type: 'checkbox',
          value: item.public
        },
        due: {
          type: 'datetime',
          value: item.due
        },
        notes: {
          type: 'text',
          value: item.notes
        },
        category: {
          type: 'select',
          options: res.locals.categories.map(function(cat) {
            return {
              value: cat._id,
              name: cat.title
            };
          }),
          value: item.category
        }
      }
    },
    assign: {
      method: 'POST',
      action: url,
      input: {
        _action: {
          type: 'hidden',
          value: 'assign'
        },
        target: {
          type: 'url'
        }
      }
    }
  };

  if (item.category) body.category = {
    href: req.userBase + '/categories/' + item.category._id
  };

  if (item.assignee) body.assignee = {
    href: item.assignee
  };

  if (item.completed) {
    body['undo-complete'] = {
      method: 'POST',
      action: url,
      input: {
        _action: {
          type: 'hidden',
          value: 'incomplete'
        }
      }
    };
  } else {
    body.complete = {
      method: 'POST',
      action: url,
      input: {
        _action: {
          type: 'hidden',
          value: 'complete'
        }
      }
    };
  }

  res.json(body);
}

app.get('/:user/items/:item', findCategories, renderItem);

app.post('/:user/items/:item', findCategories, function(req, res, next) {
  var action = req.body._action;

  function done(err) {
    if (err) return next(err);
    res.set('content-location', res.locals.url);
    renderItem(req, res, next);
  }

  if (action === 'update') {
    res.locals.item.update(bodyToItem(req.body), done);
  } else if (action === 'assign') {
    // TODO
  } else if (action === 'complete') {
    res.set('location', req.userBase + '/items');
    res.locals.item.update({completed: new Date}, done);
  } else if (action === 'incomplete') {
    res.set('location', req.userBase + '/items');
    res.locals.item.update({completed: null}, done);
  } else {
    res.send(400);
  }
});

app.del('/:user/items/:item', function(req, res, next) {
  res.locals.item.remove(function(err) {
    if (err) return next(err);
    res.set('location', req.userBase + '/items');
    res.send(204);
  });
});

function findCategories(req, res, next) {
  Category.find({}, function(err, cats) {
    if (err) return next(err);
    res.locals.categories = cats;
    next();
  });
}

app.get('/:user/categories', findCategories, function(req, res) {
  var url = req.userBase + '/categories';
  var categories = res.locals.categories;
  res.json({
    collection: categories.map(function(cat) {
      return {
        href: url + '/' + cat._id
      };
    }),
    create: {
      method: 'POST',
      action: url,
      input: {
        title: {
          type: 'text',
          required: true
        }
      }
    }
  });
});

app.post('/:user/categories', function(req, res, next) {
  var cat = new Category({
    title: req.body.title
  });
  cat.save(function(err) {
    if (err) return next(err);
    res.redirect(req.userBase + '/categories/' + cat._id);
  });
});

function findItemsByCategories(req, res, next) {
  Item.find({category: res.locals.category}, function(err, items) {
    if (err) return next(err);
    res.locals.items = items;
    next();
  });
}

app.get('/:user/categories/:category', findItemsByCategories, function(req, res) {
  var cat = res.locals.category;
  res.json({
    title: cat.title,
    items: res.locals.items.map(function(item) {
      return {
        href: req.userBase + '/items/' + item._id
      };
    }),
    'delete': {
      action: res.locals.url,
      method: 'DELETE'
    },
    'update': {
      action: res.locals.url,
      method: 'POST',
      input: {
        title: {
          required: true,
          type: 'text'
        }
      }
    }
  });
});

app.post('/:user/categories/:category', function(req, res, next) {
  res.locals.category.update({title: req.body.title}, function(err) {
    if (err) return next(err);
    res.redirect(res.locals.url);
  });
});

app.del('/:user/categories/:category', function(req, res, next) {
  res.locals.category.remove(function(err) {
    if (err) next(err);
    res.send(204);
  });
});

app.get('/:user/account', function(req, res) {
  var user = res.locals.user;
  var body = {
    username: user.username,
    'given-name': user.givenName,
    'family-name': user.familyName,
    created: user.created,
    updated: user.updated,
    update: {
      method: 'POST',
      action: req.userBase + '/account',
      input: {
        _action: {
          type: 'hidden',
          value: 'update'
        },
        username: {
          type: 'text',
          required: true,
          value: user.username
        },
        'given-name': {
          type: 'text',
          value: user.givenName
        },
        'family-name': {
          type: 'text',
          value: user.familyName
        },
        avatar: {
          type: 'url',
          value: user.avatar
        }
      }
    },
    'change-password': {
      method: 'POST',
      action: req.userBase + '/account',
      input: {
        _action: {
          type: 'hidden',
          value: 'change-password'
        },
        current: {
          type: 'password',
          required: true
        },
        'new': {
          type: 'password',
          required: true
        }
      }
    },
    'delete': {
      method: 'DELETE',
      action: req.userBase + '/account'
    },
    'assign': {
      method: 'POST',
      action: req.userBase + '/assign',
      input: {
        item: {
          type: 'url',
          required: true
        }
      }
    }
  };
  if (user.avatar) body.avatar = {
    src: user.avatar
  };
  res.json(body);
});

app.post('/:user/account', function(req, res, next) {
  var action = req.body._action;
  if (action === 'update') {
    delete req.body.password;
    res.locals.user.update(bodyToUser(req.body), function(err) {
      if (err) return next(err);
      res.redirect(res.locals.url);
    });
  } else if (action === 'change-password') {
    if (req.body.current !== res.locals.user.password) return res.send(401);
    res.locals.user.update({password: req.body['new']}, function(err) {
      if (err) return next(err);
      res.redirect(res.locals.url);
    });
  } else {
    res.send(404);
  }
});

app.del('/:user/account', function(req, res, next) {
  res.locals.user.remove(function(err) {
    if (err) return next(err);
    res.redirect(req.base);
  });
});
