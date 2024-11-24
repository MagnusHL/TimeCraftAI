import express, { Request, Response } from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import path from 'path';

export class DashboardServer {
    private app = express();
    private port = 3000;

    constructor() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, 'public')));

        this.setupRoutes();
    }

    private setupRoutes() {
        this.app.get('/api/dashboard', (req: Request, res: Response) => {
            try {
                const data = readFileSync('dashboard-data.json', 'utf-8');
                res.json(JSON.parse(data));
            } catch (error) {
                res.status(500).json({ error: 'Fehler beim Lesen der Dashboard-Daten' });
            }
        });

        this.app.get('/', (req: Request, res: Response) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
    }

    public start() {
        this.app.listen(this.port, () => {
            console.log(`\nDashboard ist verfügbar unter: http://localhost:${this.port}`);
        });
    }
} 