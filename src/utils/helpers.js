// Pagination helper
const paginate = (query = {}) => {
  const page  = Math.max(1, parseInt(query.page  || 1));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || 20)));
  return { skip: (page - 1) * limit, take: limit, page, limit };
};

// Build paginated response
const paginatedResponse = (data, total, page, limit) => ({
  data,
  pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
});

// Strip undefined keys
const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

module.exports = { paginate, paginatedResponse, clean };