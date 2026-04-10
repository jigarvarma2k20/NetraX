package sqlite

import (
	"database/sql"
	"fmt"
	"wailshark/internal/core/domain"

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

func (db *DB) SaveRepeater(name, method, url, proto, header, body string) (int64, error) {
	query := `INSERT INTO repeater_requests (name, method, url, proto, header, body) VALUES (?, ?, ?, ?, ?, ?)`
	res, err := db.conn.Exec(query, name, method, url, proto, header, body)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) UpdateRepeater(id int64, name, method, url, proto, header, body string) error {
	query := `UPDATE repeater_requests SET name = ?, method = ?, url = ?, proto = ?, header = ?, body = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?`
	_, err := db.conn.Exec(query, name, method, url, proto, header, body, id)
	return err
}

func (db *DB) DeleteRepeater(id int64) error {
	query := `DELETE FROM repeater_requests WHERE id = ?`
	_, err := db.conn.Exec(query, id)
	return err
}

type RepeaterRequest struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Method   string `json:"method"`
	URL      string `json:"url"`
	Proto    string `json:"proto"`
	Header   string `json:"header"`
	Body     string `json:"body"`
	Modified string `json:"modified_at"`
}

func (db *DB) GetRepeaters() ([]RepeaterRequest, error) {
	query := `SELECT id, name, method, url, proto, header, body, modified_at FROM repeater_requests ORDER BY id ASC`
	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []RepeaterRequest
	for rows.Next() {
		var r RepeaterRequest
		var proto sql.NullString // Handle possible NULLs
		if err := rows.Scan(&r.ID, &r.Name, &r.Method, &r.URL, &proto, &r.Header, &r.Body, &r.Modified); err != nil {
			return nil, err
		}
		r.Proto = proto.String
		if r.Proto == "" {
			r.Proto = "HTTP/1.1"
		}
		requests = append(requests, r)
	}
	return requests, nil
}
