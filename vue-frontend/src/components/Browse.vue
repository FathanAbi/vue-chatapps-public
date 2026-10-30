<script setup>
</script>

<template>
    <div>
        <h1>Browse User</h1>
    </div>
    <br>
    <div>
        <input
            v-model="search"
            type="text"
            placeholder="Search users by username..."
            @input="onSearch"
        />
    </div>
    <br>
    <div v-if="!search.trim()" class="hint">
        Type at least 2 characters to find a user.
    </div>
    <div v-else-if="!users?.length" class="hint">No matching users.</div>
    <div v-for="(user, index) in users" :key="index" class="card">
        <div @click="goToChat(user.id)">
            {{ user.username }}
        </div>
        
    </div>
    <br>
    
</template>

<script>
    export default {
        data(){
            return {
                users: [],
                search: '',
                searchTimer: null,
            }
        },
        methods: {
            onSearch(){
                if (this.searchTimer) clearTimeout(this.searchTimer)
                this.searchTimer = setTimeout(() => {
                    this.getUsers()
                }, 300)
            },
            async getUsers(){
                const term = this.search.trim()

                // SEC-013: the directory is search-based and rejects an empty term.
                if (term.length < 2) {
                    this.users = []
                    return
                }

                try {
                    const query = new URLSearchParams({ q: term, limit: '25' })
                    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/penggunas/directory?${query}`, {
                        method: "GET",
                        credentials: "include",
                        headers: {
                            "Content-Type": "application/json",
                        },
                    });

                    if (!resp.ok) {
                        const errorMsg = (await resp.json())?.errors?.[0]?.message;
                        throw new Error(errorMsg || resp.statusText);
                    }

                    const response = await resp.json()

                    this.users = response.docs
                } catch(error) {
                    alert(error.message)
                }
            },
            create(){
                this.$router.push("/create")
            },
            goToChat(user_id){
                this.$router.push(`/chat/${user_id}`)
            }
        }
    }
</script>

<style>
/* Add some basic styling for the cards */
.card {
  border: 1px solid #ccc;
  padding: 10px;
  margin: 10px;
  width: 200px;
  text-align: center;
}

.hint {
  margin: 10px;
  color: #6b7280;
}
</style>
