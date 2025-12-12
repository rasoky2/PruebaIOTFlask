import sqlite3
import os

# Configuración de base de datos
DB_PATH = 'patients.db'

# Esquemas de tablas
PATIENTS_SCHEMA = """
CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    identifier TEXT,
    age INTEGER,
    last_temp REAL,
    avg_bpm REAL,
    created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
)
"""

SESSIONS_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    avg_bpm REAL,
    min_bpm REAL,
    max_bpm REAL,
    last_temp REAL,
    start_at REAL,
    end_at REAL,
    created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(patient_id) REFERENCES patients(id)
)
"""

def init_db():
    """Inicializa la base de datos SQLite con las tablas necesarias"""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Crear tabla de pacientes
    cur.execute(PATIENTS_SCHEMA)

    # Crear tabla de sesiones detalladas
    cur.execute(SESSIONS_SCHEMA)

    conn.commit()
    conn.close()
    print(f"Base de datos inicializada en {DB_PATH}")

def get_db_connection():
    """Obtiene una conexión a la base de datos"""
    return sqlite3.connect(DB_PATH)

# Funciones para tabla PATIENTS

def save_patient_record(name, identifier, age, last_temp, avg_bpm):
    """Guarda el registro del paciente al cerrar sesión"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO patients (name, identifier, age, last_temp, avg_bpm)
        VALUES (?, ?, ?, ?, ?)
        """,
        (name, identifier, age, last_temp, avg_bpm)
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id

def list_patient_records(limit=50):
    """Obtiene registros recientes de pacientes"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, name, identifier, age, last_temp, avg_bpm, created_at
        FROM patients
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,)
    )
    rows = cur.fetchall()
    conn.close()
    return [
        {
            'id': r[0],
            'name': r[1],
            'identifier': r[2],
            'age': r[3],
            'last_temp': r[4],
            'avg_bpm': r[5],
            'created_at': r[6],
        }
        for r in rows
    ]

def create_patient(name, identifier=None, age=None):
    """Crea un nuevo paciente"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO patients (name, identifier, age, last_temp, avg_bpm)
        VALUES (?, ?, ?, NULL, NULL)
        """,
        (name, identifier, age)
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id

def update_patient(pid, name, identifier=None, age=None):
    """Actualiza datos de un paciente"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE patients
        SET name = ?, identifier = ?, age = ?
        WHERE id = ?
        """,
        (name, identifier, age, pid)
    )
    conn.commit()
    changes = cur.rowcount
    conn.close()
    return changes > 0

def delete_patient(pid):
    """Elimina un registro de paciente"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM patients WHERE id = ?", (pid,))
    conn.commit()
    changes = cur.rowcount
    conn.close()
    return changes > 0

def update_patient_summary(pid, last_temp, avg_bpm):
    """Actualiza resumen de métricas en tabla patients"""
    if not pid:
        return False
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE patients
        SET last_temp = ?, avg_bpm = ?
        WHERE id = ?
        """,
        (last_temp, avg_bpm, pid)
    )
    conn.commit()
    changes = cur.rowcount
    conn.close()
    return changes > 0

# Funciones para tabla SESSIONS

def save_session_record(patient_id, avg_bpm, min_bpm, max_bpm, last_temp, start_at, end_at):
    """Guarda un registro de sesión detallado"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO sessions (patient_id, avg_bpm, min_bpm, max_bpm, last_temp, start_at, end_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (patient_id, avg_bpm, min_bpm, max_bpm, last_temp, start_at, end_at)
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id

def list_patient_sessions(patient_id, limit=50):
    """Obtiene sesiones recientes de un paciente específico"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, avg_bpm, min_bpm, max_bpm, last_temp, start_at, end_at, created_at
        FROM sessions
        WHERE patient_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (patient_id, limit)
    )
    rows = cur.fetchall()
    conn.close()
    return [
        {
            'id': r[0],
            'avg_bpm': r[1],
            'min_bpm': r[2],
            'max_bpm': r[3],
            'last_temp': r[4],
            'start_at': r[5],
            'end_at': r[6],
            'created_at': r[7],
        }
        for r in rows
    ]

def get_session_by_id(session_id):
    """Obtiene una sesión específica por ID"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, patient_id, avg_bpm, min_bpm, max_bpm, last_temp, start_at, end_at, created_at
        FROM sessions
        WHERE id = ?
        """,
        (session_id,)
    )
    row = cur.fetchone()
    conn.close()
    if row:
        return {
            'id': row[0],
            'patient_id': row[1],
            'avg_bpm': row[2],
            'min_bpm': row[3],
            'max_bpm': row[4],
            'last_temp': row[5],
            'start_at': row[6],
            'end_at': row[7],
            'created_at': row[8],
        }
    return None

# Funciones de utilidad

def get_db_stats():
    """Obtiene estadísticas básicas de la base de datos"""
    conn = get_db_connection()
    cur = conn.cursor()

    # Contar registros en cada tabla
    cur.execute("SELECT COUNT(*) FROM patients")
    patients_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM sessions")
    sessions_count = cur.fetchone()[0]

    # Obtener tamaño del archivo
    db_size = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0

    conn.close()

    return {
        'patients_count': patients_count,
        'sessions_count': sessions_count,
        'db_size_bytes': db_size,
        'db_size_mb': round(db_size / (1024 * 1024), 2)
    }
