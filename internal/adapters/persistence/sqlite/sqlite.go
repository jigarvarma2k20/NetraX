package sqlite

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/jigarvarma2k20/netrax/internal/core/domain"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	conn *sql.DB
}

func InitDB(filepath string) (*DB, error) {
	conn, err := sql.Open("sqlite3", filepath)
	if err != nil {
		return nil, err
	}

	// Performance pragmas
	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA cache_size=-64000",
		"PRAGMA busy_timeout=5000",
		"PRAGMA temp_store=MEMORY",
		"PRAGMA mmap_size=268435456",
	}
	for _, p := range pragmas {
		_, err = conn.Exec(p)
		if err != nil {
			return nil, fmt.Errorf("pragma error: %s: %w", p, err)
		}
	}

	err = createTables(conn)
	if err != nil {
		return nil, err
	}

	return &DB{conn: conn}, nil
}

func createTables(conn *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS requests (
		id INTEGER PRIMARY KEY,
		method TEXT,
		url TEXT,
		proto TEXT,
		host TEXT,
		remote_addr TEXT,
		header TEXT,
		content_length INTEGER,
		transfer_encoding TEXT,
		close BOOLEAN,
		body TEXT
	);
	CREATE TABLE IF NOT EXISTS responses (
		id INTEGER PRIMARY KEY,
		request_id INTEGER,
		status TEXT,
		status_code INTEGER,
		proto TEXT,
		header TEXT,
		content_length INTEGER,
		content_type TEXT,
		body TEXT
	);
	CREATE TABLE IF NOT EXISTS repeater_requests (
		id INTEGER PRIMARY KEY,
		name TEXT,
		method TEXT,
		url TEXT,
		proto TEXT DEFAULT 'HTTP/1.1',
		header TEXT,
		body TEXT,
		modified_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS repeater_responses (
		id INTEGER PRIMARY KEY,
		request_id INTEGER,
		status TEXT,
		status_code INTEGER,
		proto TEXT,
		header TEXT,
		content_length INTEGER,
		content_type TEXT,
		body TEXT
	);
	CREATE TABLE IF NOT EXISTS agent_history (
		id INTEGER PRIMARY KEY,
		role TEXT,
		content TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err := conn.Exec(schema)
	if err != nil {
		return fmt.Errorf("sql error %s", err.Error())
	}
	return nil
}

func (db *DB) InsertRequest(r *domain.HTTPRequestDTO) (int64, error) {
	query := `
	INSERT INTO requests (method, url, proto, host, remote_addr, header, content_length, transfer_encoding, close, body)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	result, err := db.conn.Exec(query, r.Method, r.URL, r.Proto, r.Host, r.RemoteAddr, r.Header, r.ContentLength, fmt.Sprintf("%v", r.TransferEncoding), r.Close, r.Body)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (db *DB) InsertResponse(resp *domain.HTTPResponseDTO, requestID int64) (int64, error) {
	query := `
	INSERT INTO responses (request_id, status, status_code, proto, header, content_length, content_type, body)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	result, err := db.conn.Exec(query, requestID, resp.Status, resp.StatusCode, resp.Proto, resp.Header, resp.ContentLength, resp.ContentType, resp.Body)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (db *DB) Close() error {
	return db.conn.Close()
}

// GetRequests retrieves requests with pagination
func (db *DB) GetAllRequests() ([]domain.HTTPTransactionDTO, error) {
	return db.GetRequests(1000, 0)
}

// GetRequests retrieves requests with pagination
func (db *DB) GetRequests(limit, offset int) ([]domain.HTTPTransactionDTO, error) {
	query := `
	SELECT r.id, r.method, r.url, r.proto, r.host, r.remote_addr, r.header, r.content_length, r.transfer_encoding, r.close,
	       res.id, res.status, res.status_code, res.proto, res.header, res.content_length, res.content_type
	FROM requests r
	LEFT JOIN responses res ON r.id = res.request_id
	ORDER BY r.id DESC
	LIMIT ? OFFSET ?
	`
	rows, err := db.conn.Query(query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []domain.HTTPTransactionDTO

	for rows.Next() {
		var req domain.HTTPRequestDTO
		var respID sql.NullInt64
		var respStatus sql.NullString
		var respStatusCode sql.NullInt64
		var respProto sql.NullString
		var respHeader sql.NullString
		var respContentLength sql.NullInt64
		var respContentType sql.NullString

		err := rows.Scan(
			&req.ID, &req.Method, &req.URL, &req.Proto, &req.Host, &req.RemoteAddr,
			&req.Header, &req.ContentLength, &req.TransferEncoding, &req.Close,
			&respID, &respStatus, &respStatusCode, &respProto, &respHeader,
			&respContentLength, &respContentType,
		)
		if err != nil {
			return nil, err
		}

		transaction := domain.HTTPTransactionDTO{
			Request: req,
			Index:   req.ID,
		}

		if respID.Valid {
			transaction.Response = domain.HTTPResponseDTO{
				ID:            respID.Int64,
				Status:        respStatus.String,
				StatusCode:    int(respStatusCode.Int64),
				Proto:         respProto.String,
				Header:        respHeader.String,
				ContentLength: int(respContentLength.Int64),
				ContentType:   respContentType.String,
			}
		}

		transactions = append(transactions, transaction)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return transactions, nil
}

func buildFilteredWhereClause(opts domain.FilterOptions) (string, []interface{}) {
	var queryBuilder strings.Builder
	var args []interface{}

	if opts.SearchQuery != "" {
		likeQuery := "%" + opts.SearchQuery + "%"
		queryBuilder.WriteString(" AND (r.url LIKE ? OR r.header LIKE ? OR r.body LIKE ? OR res.header LIKE ? OR res.body LIKE ?)")
		args = append(args, likeQuery, likeQuery, likeQuery, likeQuery, likeQuery)
	}

	if len(opts.StatusCodes) > 0 {
		var statusConditions []string
		for _, sc := range opts.StatusCodes {
			switch sc {
			case "1xx":
				statusConditions = append(statusConditions, "(res.status_code >= 100 AND res.status_code < 200)")
			case "2xx":
				statusConditions = append(statusConditions, "(res.status_code >= 200 AND res.status_code < 300)")
			case "3xx":
				statusConditions = append(statusConditions, "(res.status_code >= 300 AND res.status_code < 400)")
			case "4xx":
				statusConditions = append(statusConditions, "(res.status_code >= 400 AND res.status_code < 500)")
			case "5xx":
				statusConditions = append(statusConditions, "(res.status_code >= 500 AND res.status_code < 600)")
			}
		}
		if len(statusConditions) > 0 {
			queryBuilder.WriteString(" AND (" + strings.Join(statusConditions, " OR ") + ")")
		}
	}

	if opts.HideMedia {
		queryBuilder.WriteString(` AND NOT (
			r.url LIKE '%.png' OR r.url LIKE '%.jpg' OR r.url LIKE '%.jpeg' OR r.url LIKE '%.gif' 
			OR r.url LIKE '%.webp' OR r.url LIKE '%.svg' OR r.url LIKE '%.ico' OR r.url LIKE '%.mp4' 
			OR res.content_type LIKE 'image/%' OR res.content_type LIKE 'video/%'
		)`)
	}

	if opts.HideCSS {
		queryBuilder.WriteString(` AND NOT (r.url LIKE '%.css' OR res.content_type LIKE 'text/css%')`)
	}

	if opts.HideJS {
		queryBuilder.WriteString(` AND NOT (r.url LIKE '%.js' OR res.content_type LIKE 'application/javascript%' OR res.content_type LIKE 'text/javascript%')`)
	}

	return queryBuilder.String(), args
}

// GetFilteredRequests retrieves requests matching a query with pagination
func (db *DB) GetFilteredRequests(opts domain.FilterOptions, limit, offset int) ([]domain.HTTPTransactionDTO, error) {
	whereClause, args := buildFilteredWhereClause(opts)

	orderCol := "r.id"
	switch opts.SortBy {
	case "method":
		orderCol = "r.method"
	case "url":
		orderCol = "r.url"
	case "status":
		orderCol = "res.status_code"
	case "id":
		orderCol = "r.id"
	}

	orderDir := "ASC"
	if opts.SortDesc {
		orderDir = "DESC"
	}

	// Default empty opts.SortBy to descending ID
	if opts.SortBy == "" {
		orderCol = "r.id"
		orderDir = "DESC"
	}

	query := `
	SELECT r.id, r.method, r.url, r.proto, r.host, r.remote_addr, r.header, r.content_length, r.transfer_encoding, r.close,
	       res.id, res.status, res.status_code, res.proto, res.header, res.content_length, res.content_type
	FROM requests r
	LEFT JOIN responses res ON r.id = res.request_id
	WHERE 1=1 ` + whereClause + `
	ORDER BY ` + orderCol + ` ` + orderDir + ` LIMIT ? OFFSET ?
	`
	args = append(args, limit, offset)

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []domain.HTTPTransactionDTO

	for rows.Next() {
		var req domain.HTTPRequestDTO
		var respID sql.NullInt64
		var respStatus sql.NullString
		var respStatusCode sql.NullInt64
		var respProto sql.NullString
		var respHeader sql.NullString
		var respContentLength sql.NullInt64
		var respContentType sql.NullString

		err := rows.Scan(
			&req.ID, &req.Method, &req.URL, &req.Proto, &req.Host, &req.RemoteAddr,
			&req.Header, &req.ContentLength, &req.TransferEncoding, &req.Close,
			&respID, &respStatus, &respStatusCode, &respProto, &respHeader,
			&respContentLength, &respContentType,
		)
		if err != nil {
			return nil, err
		}

		transaction := domain.HTTPTransactionDTO{
			Request: req,
			Index:   req.ID,
		}

		if respID.Valid {
			transaction.Response = domain.HTTPResponseDTO{
				ID:            respID.Int64,
				Status:        respStatus.String,
				StatusCode:    int(respStatusCode.Int64),
				Proto:         respProto.String,
				Header:        respHeader.String,
				ContentLength: int(respContentLength.Int64),
				ContentType:   respContentType.String,
			}
		}

		transactions = append(transactions, transaction)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return transactions, nil
}

// GetFilteredRequestsCount returns the total number of requests matching the given filters
func (db *DB) GetFilteredRequestsCount(opts domain.FilterOptions) (int, error) {
	whereClause, args := buildFilteredWhereClause(opts)

	query := `
	SELECT COUNT(r.id)
	FROM requests r
	LEFT JOIN responses res ON r.id = res.request_id
	WHERE 1=1 ` + whereClause

	var count int
	err := db.conn.QueryRow(query, args...).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

func (db *DB) GetRequestByIDWithoutBody(id int64) (*domain.HTTPTransactionDTO, error) {
	query := `
	SELECT r.id, r.method, r.url, r.proto, r.host, r.remote_addr, r.header, r.content_length, r.transfer_encoding, r.close,
	       res.id, res.status, res.status_code, res.proto, res.header, res.content_length, res.content_type
	FROM requests r
	LEFT JOIN responses res ON r.id = res.request_id
	WHERE r.id = ?
	`
	row := db.conn.QueryRow(query, id)

	var req domain.HTTPRequestDTO

	// Response fields might be NULL
	var respID sql.NullInt64
	var respStatus sql.NullString
	var respStatusCode sql.NullInt64
	var respProto sql.NullString
	var respHeader sql.NullString
	var respContentLength sql.NullInt64
	var respContentType sql.NullString

	err := row.Scan(
		&req.ID, &req.Method, &req.URL, &req.Proto, &req.Host, &req.RemoteAddr,
		&req.Header, &req.ContentLength, &req.TransferEncoding, &req.Close,
		&respID, &respStatus, &respStatusCode, &respProto, &respHeader,
		&respContentLength, &respContentType,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // No result found
		}

		return nil, err
	}

	transaction := &domain.HTTPTransactionDTO{
		Request: req,
		Index:   req.ID,
	}
	if respID.Valid {
		transaction.Response = domain.HTTPResponseDTO{
			ID:            respID.Int64,
			Status:        respStatus.String,
			StatusCode:    int(respStatusCode.Int64),
			Proto:         respProto.String,
			Header:        respHeader.String,
			ContentLength: int(respContentLength.Int64),
			ContentType:   respContentType.String,
		}
	}

	return transaction, nil
}

func (db *DB) GetRequestByID(id int64) (*domain.HTTPTransactionDTO, error) {
	query := `
	SELECT r.id, r.method, r.url, r.proto, r.host, r.remote_addr, r.header, r.content_length, r.transfer_encoding, r.close, r.body,
	       res.id, res.status, res.status_code, res.proto, res.header, res.content_length, res.content_type, res.body
	FROM requests r
	LEFT JOIN responses res ON r.id = res.request_id
	WHERE r.id = ?
	`
	row := db.conn.QueryRow(query, id)

	var req domain.HTTPRequestDTO

	// Response fields might be NULL
	var respID sql.NullInt64
	var respStatus sql.NullString
	var respStatusCode sql.NullInt64
	var respProto sql.NullString
	var respHeader sql.NullString
	var respContentLength sql.NullInt64
	var respContentType sql.NullString
	var respBody sql.NullString

	err := row.Scan(
		&req.ID, &req.Method, &req.URL, &req.Proto, &req.Host, &req.RemoteAddr,
		&req.Header, &req.ContentLength, &req.TransferEncoding, &req.Close, &req.Body,
		&respID, &respStatus, &respStatusCode, &respProto, &respHeader,
		&respContentLength, &respContentType, &respBody,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	transaction := &domain.HTTPTransactionDTO{
		Request: req,
		Index:   req.ID,
	}
	if respID.Valid {
		transaction.Response = domain.HTTPResponseDTO{
			ID:            respID.Int64,
			Status:        respStatus.String,
			StatusCode:    int(respStatusCode.Int64),
			Proto:         respProto.String,
			Header:        respHeader.String,
			ContentLength: int(respContentLength.Int64),
			ContentType:   respContentType.String,
			Body:          respBody.String,
		}
	}

	return transaction, nil
}

// Repeater Methods

func (db *DB) SaveRepeater(name string, req domain.HTTPRequestDTO, res *domain.HTTPResponseDTO) (int64, error) {
	reqQuery := `INSERT INTO repeater_requests (name, method, url, proto, header, body) VALUES (?, ?, ?, ?, ?, ?)`
	result, err := db.conn.Exec(reqQuery, name, req.Method, req.URL, req.Proto, req.Header, req.Body)
	if err != nil {
		return 0, err
	}

	reqID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	if res != nil && (res.StatusCode != 0 || res.Body != "") {
		resQuery := `INSERT INTO repeater_responses (request_id, status, status_code, proto, header, content_length, content_type, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		_, err = db.conn.Exec(resQuery, reqID, res.Status, res.StatusCode, res.Proto, res.Header, res.ContentLength, res.ContentType, res.Body)
		if err != nil {
			return 0, err
		}
	}

	return reqID, nil
}

func (db *DB) UpdateRepeater(id int64, name string, req domain.HTTPRequestDTO, res *domain.HTTPResponseDTO) error {
	reqQuery := `UPDATE repeater_requests SET name = ?, method = ?, url = ?, proto = ?, header = ?, body = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?`
	_, err := db.conn.Exec(reqQuery, name, req.Method, req.URL, req.Proto, req.Header, req.Body, id)
	if err != nil {
		return err
	}

	db.conn.Exec(`DELETE FROM repeater_responses WHERE request_id = ?`, id)

	if res != nil && (res.StatusCode != 0 || res.Body != "") {
		resQuery := `INSERT INTO repeater_responses (request_id, status, status_code, proto, header, content_length, content_type, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		_, err = db.conn.Exec(resQuery, id, res.Status, res.StatusCode, res.Proto, res.Header, res.ContentLength, res.ContentType, res.Body)
		if err != nil {
			return err
		}
	}

	return nil
}

func (db *DB) DeleteRepeater(id int64) error {
	db.conn.Exec(`DELETE FROM repeater_responses WHERE request_id = ?`, id)
	query := `DELETE FROM repeater_requests WHERE id = ?`
	_, err := db.conn.Exec(query, id)
	return err
}

type RepeaterRequest struct {
	ID       int64                   `json:"id"`
	Name     string                  `json:"name"`
	Request  domain.HTTPRequestDTO   `json:"request"`
	Response *domain.HTTPResponseDTO `json:"response"`
	Modified string                  `json:"modified_at"`
}

func (db *DB) GetRepeaters() ([]RepeaterRequest, error) {
	query := `SELECT 
		req.id, req.name, req.method, req.url, req.proto, req.header, req.body, req.modified_at,
		res.id, res.status, res.status_code, res.proto, res.header, res.content_length, res.content_type, res.body
		FROM repeater_requests req
		LEFT JOIN repeater_responses res ON req.id = res.request_id
		ORDER BY req.id ASC`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []RepeaterRequest
	for rows.Next() {
		var r RepeaterRequest
		var req domain.HTTPRequestDTO
		var res domain.HTTPResponseDTO

		var reqProto sql.NullString
		var resID sql.NullInt64
		var resStatus sql.NullString
		var resStatusCode sql.NullInt64
		var resProto sql.NullString
		var resHeader sql.NullString
		var resContentLength sql.NullInt64
		var resContentType sql.NullString
		var resBody sql.NullString

		if err := rows.Scan(
			&r.ID, &r.Name, &req.Method, &req.URL, &reqProto, &req.Header, &req.Body, &r.Modified,
			&resID, &resStatus, &resStatusCode, &resProto, &resHeader, &resContentLength, &resContentType, &resBody,
		); err != nil {
			return nil, err
		}

		req.Proto = reqProto.String
		if req.Proto == "" {
			req.Proto = "HTTP/1.1"
		}

		r.Request = req

		if resID.Valid {
			res.ID = resID.Int64
			res.Status = resStatus.String
			res.StatusCode = int(resStatusCode.Int64)
			res.Proto = resProto.String
			res.Header = resHeader.String
			res.ContentLength = int(resContentLength.Int64)
			res.ContentType = resContentType.String
			res.Body = resBody.String
			r.Response = &res
		}

		requests = append(requests, r)
	}
	return requests, nil
}

type AgentMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func (db *DB) SaveAgentMessage(role, content string) error {
	query := `INSERT INTO agent_history (role, content) VALUES (?, ?)`
	_, err := db.conn.Exec(query, role, content)
	return err
}

func (db *DB) GetAgentHistory() ([]AgentMessage, error) {
	query := `SELECT role, content FROM agent_history ORDER BY id ASC`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []AgentMessage
	for rows.Next() {
		var m AgentMessage
		if err := rows.Scan(&m.Role, &m.Content); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, nil
}

func (db *DB) ClearAgentHistory() error {
	query := `DELETE FROM agent_history`
	_, err := db.conn.Exec(query)
	return err
}
