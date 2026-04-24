<?php

namespace Database\Seeders;

use App\Models\CrowdAlert;
use App\Models\SimulationScenario;
use App\Models\User;
use App\Models\Venue;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::query()->updateOrCreate(
            ['email' => 'demo@crowdsim.ai'],
            [
                'name'     => 'Demo Operator',
                'password' => Hash::make('Password123!'),
            ]
        );

        Venue::query()->firstOrCreate(
            ['name' => 'King Fahd Stadium'],
            ['region' => 'Riyadh', 'status' => 'active', 'capacity' => 68000]
        );
        Venue::query()->firstOrCreate(
            ['name' => 'Riyadh Metro Hub A'],
            ['region' => 'Riyadh', 'status' => 'active', 'capacity' => 12000]
        );
        Venue::query()->firstOrCreate(
            ['name' => 'Convention Centre North'],
            ['region' => 'Riyadh', 'status' => 'maintenance', 'capacity' => 9000]
        );

        SimulationScenario::query()->firstOrCreate(
            ['name' => 'Concert egress'],
            ['category' => 'Entertainment', 'status' => 'published', 'runs' => 42]
        );
        SimulationScenario::query()->firstOrCreate(
            ['name' => 'Match day ingress'],
            ['category' => 'Sports', 'status' => 'published', 'runs' => 31]
        );
        SimulationScenario::query()->firstOrCreate(
            ['name' => 'Festival peak hour'],
            ['category' => 'Festival', 'status' => 'draft', 'runs' => 5]
        );

        CrowdAlert::query()->firstOrCreate(
            ['title' => 'Density threshold exceeded', 'zone' => 'Central Plaza'],
            ['severity' => 'High', 'status' => 'open', 'triggered_at' => now()->subMinutes(5)]
        );
        CrowdAlert::query()->firstOrCreate(
            ['title' => 'Flow slowdown detected', 'zone' => 'East Concourse'],
            ['severity' => 'Medium', 'status' => 'ack', 'triggered_at' => now()->subMinutes(22)]
        );
    }
}
